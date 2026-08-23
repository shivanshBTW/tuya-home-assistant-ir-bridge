import { compareIrBits } from '../tuya/irDecode.js';
import type {
  TrainerDisabledNote,
  TrainerInference,
  TrainerParamField,
  TrainerSample,
  TrainerSchema,
} from '../types.js';

const sliceBits = (bits: string, bitIndexes: number[]): string => {
  return bitIndexes.map((index) => bits[index] ?? '').join('');
};

const listChangedParamIds = ({
  left,
  right,
}: {
  left: Record<string, string>;
  right: Record<string, string>;
}): string[] => {
  const paramIds = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...paramIds].filter((paramId) => left[paramId] !== right[paramId]);
};

const intersectSets = (sets: Set<number>[]): Set<number> => {
  const [firstSet, ...restSets] = sets;
  if (!firstSet) {
    return new Set();
  }
  return new Set(
    [...firstSet].filter((value) => restSets.every((candidate) => candidate.has(value))),
  );
};

const parseBinaryInt = (bits: string): number | undefined => {
  if (!bits || /[^01]/.test(bits)) {
    return undefined;
  }
  return Number.parseInt(bits, 2);
};

const fieldKindForLookup = (lookup: Record<string, string>): TrainerParamField['kind'] => {
  const points = Object.entries(lookup)
    .filter(([optionId]) => /^-?\d+$/.test(optionId))
    .map(([optionId, bits]) => ({ optionNumber: Number(optionId), bitNumber: parseBinaryInt(bits) }))
    .filter((point): point is { optionNumber: number; bitNumber: number } => point.bitNumber !== undefined)
    .sort((left, right) => left.optionNumber - right.optionNumber);
  if (points.length < 3) {
    return 'lookup';
  }
  const firstPoint = points[0];
  const secondPoint = points[1];
  if (!firstPoint || !secondPoint) {
    return 'lookup';
  }
  const optionStep = secondPoint.optionNumber - firstPoint.optionNumber;
  const bitStep = secondPoint.bitNumber - firstPoint.bitNumber;
  if (optionStep === 0) {
    return 'lookup';
  }
  const isLinear = points.every((point) => {
    const expected =
      firstPoint.bitNumber + ((point.optionNumber - firstPoint.optionNumber) * bitStep) / optionStep;
    return point.bitNumber === expected;
  });
  return isLinear ? 'linear' : 'lookup';
};

const classifyDisabledRole = ({
  schema,
  samples,
  field,
  primaryOptionId,
  paramId,
}: {
  schema: TrainerSchema;
  samples: TrainerSample[];
  field: TrainerParamField;
  primaryOptionId: string;
  paramId: string;
}): TrainerDisabledNote | undefined => {
  const orderedSamples = [...samples].sort((left, right) =>
    left.receivedAt.localeCompare(right.receivedAt),
  );
  const disabledSamples = orderedSamples.filter(
    (sample) =>
      sample.paramValues[schema.primaryParamId] === primaryOptionId &&
      sample.paramValues[paramId] === undefined,
  );
  if (disabledSamples.length === 0) {
    return undefined;
  }
  if (disabledSamples.some((sample) => sample.bits.length <= (field.bitIndexes.at(-1) ?? -1))) {
    return {
      primaryOptionId,
      paramId,
      role: 'omitted',
      detail: 'Frame is shorter than the inferred field',
    };
  }
  const slices = disabledSamples.map((sample) => sliceBits(sample.bits, field.bitIndexes));
  const precedingSlices = disabledSamples.map((sample) => {
    const previousEnabled = [...orderedSamples]
      .reverse()
      .find(
        (candidate) =>
          candidate.receivedAt < sample.receivedAt && candidate.paramValues[paramId] !== undefined,
      );
    return previousEnabled ? sliceBits(previousEnabled.bits, field.bitIndexes) : undefined;
  });
  const uniqueSlices = new Set(slices);
  const isSticky =
    precedingSlices.length >= 2 &&
    precedingSlices.every((slice) => slice !== undefined) &&
    new Set(precedingSlices).size >= 2 &&
    slices.every((slice, index) => slice === precedingSlices[index]);
  if (isSticky) {
    return {
      primaryOptionId,
      paramId,
      role: 'sticky',
      detail: 'Disabled field follows the last enabled value',
    };
  }
  if (uniqueSlices.size === 1) {
    return {
      primaryOptionId,
      paramId,
      role: 'constant',
      detail: `Disabled field stays ${[...uniqueSlices][0]}`,
    };
  }
  return {
    primaryOptionId,
    paramId,
    role: 'active',
    detail: 'Disabled field still changes; the constraint may be wrong',
  };
};

export const inferTrainerFields = ({
  schema,
  samples,
}: {
  schema: TrainerSchema;
  samples: TrainerSample[];
}): TrainerInference => {
  const usableSamples = samples.filter((sample) => sample.bits && !sample.bits.includes('?'));
  const flipsByParamId: Record<string, Set<number>> = {};
  const unresolved: string[] = [];

  for (let leftIndex = 0; leftIndex < usableSamples.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < usableSamples.length; rightIndex += 1) {
      const leftSample = usableSamples[leftIndex];
      const rightSample = usableSamples[rightIndex];
      if (!leftSample || !rightSample) {
        continue;
      }
      const changedParamIds = listChangedParamIds({
        left: leftSample.paramValues,
        right: rightSample.paramValues,
      });
      if (changedParamIds.length !== 1) {
        continue;
      }
      const paramId = changedParamIds[0];
      if (!paramId) {
        continue;
      }
      const bitDiffs = compareIrBits({ left: leftSample.bits, right: rightSample.bits });
      const flipSet = flipsByParamId[paramId] ?? new Set<number>();
      for (const diff of bitDiffs) {
        flipSet.add(diff.index);
      }
      flipsByParamId[paramId] = flipSet;
    }
  }

  const axisFlipSets = Object.values(flipsByParamId).filter((flipSet) => flipSet.size > 0);
  const checksumIndexes = [
    ...(axisFlipSets.length >= 2 ? intersectSets(axisFlipSets) : new Set<number>()),
  ].sort((left, right) => left - right);
  const checksumSet = new Set(checksumIndexes);

  const fields: TrainerParamField[] = schema.params.map((param) => {
    const rawIndexes = [...(flipsByParamId[param.id] ?? [])].sort((left, right) => left - right);
    const bitIndexes = rawIndexes.filter((index) => !checksumSet.has(index));
    if (bitIndexes.length === 0) {
      const reason =
        usableSamples.filter((sample) => sample.paramValues[param.id] !== undefined).length < 2
          ? 'Need at least two labeled frames for this param'
          : 'No unique bits after removing checksum';
      unresolved.push(`${param.id}: ${reason}`);
      return {
        paramId: param.id,
        bitIndexes: [],
        kind: 'unresolved',
        lookup: {},
        unresolvedReason: reason,
      };
    }
    const lookup: Record<string, string> = {};
    for (const sample of usableSamples) {
      const optionId = sample.paramValues[param.id];
      if (optionId === undefined) {
        continue;
      }
      lookup[optionId] = sliceBits(sample.bits, bitIndexes);
    }
    return {
      paramId: param.id,
      bitIndexes,
      kind: fieldKindForLookup(lookup),
      lookup,
    };
  });

  const disabledNotes: TrainerDisabledNote[] = [];
  const primaryParam = schema.params.find((param) => param.id === schema.primaryParamId);
  for (const primaryOption of primaryParam?.options ?? []) {
    const constraints = schema.constraints[primaryOption.id] ?? {};
    for (const [paramId, constraint] of Object.entries(constraints)) {
      if (constraint.kind !== 'off') {
        continue;
      }
      const field = fields.find((item) => item.paramId === paramId && item.kind !== 'unresolved');
      if (!field) {
        continue;
      }
      const note = classifyDisabledRole({
        schema,
        samples: usableSamples,
        field,
        primaryOptionId: primaryOption.id,
        paramId,
      });
      if (note) {
        disabledNotes.push(note);
      }
    }
  }

  return {
    fields,
    checksumIndexes,
    disabledNotes,
    unresolved,
  };
};
