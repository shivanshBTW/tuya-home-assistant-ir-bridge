import { compareIrBits } from '../tuya/irDecode.js';
import type {
  TrainerDisabledNote,
  TrainerInference,
  TrainerParamField,
  TrainerSample,
  TrainerSchema,
} from '../types.js';
import { isSeparateCommandParam } from './trainerPlan.js';

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
  const sharedParamIds = Object.keys(left).filter((paramId) => right[paramId] !== undefined);
  return sharedParamIds.filter((paramId) => left[paramId] !== right[paramId]);
};

const hasSameParamKeys = ({
  left,
  right,
}: {
  left: Record<string, string>;
  right: Record<string, string>;
}): boolean => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
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

const serializeParamValues = (paramValues: Record<string, string>): string => {
  return Object.keys(paramValues)
    .sort()
    .map((paramId) => `${paramId}=${paramValues[paramId]}`)
    .join('|');
};

const LAYOUT_CHANGE_MIN_FLIPS = 8;
const FRAME_VARIANT_BIT_INDEX = 8;
const FRAME_VARIANT_BIT_LENGTH = 4;

const majorityBitSlice = ({
  samples,
  startIndex,
  bitLength,
}: {
  samples: TrainerSample[];
  startIndex: number;
  bitLength: number;
}): string | undefined => {
  const countBySlice = new Map<string, number>();
  for (const sample of samples) {
    const slice = sample.bits.slice(startIndex, startIndex + bitLength);
    if (slice.length < bitLength) {
      continue;
    }
    countBySlice.set(slice, (countBySlice.get(slice) ?? 0) + 1);
  }
  let majoritySlice: string | undefined;
  let majorityCount = 0;
  for (const [slice, count] of countBySlice) {
    if (count > majorityCount) {
      majoritySlice = slice;
      majorityCount = count;
    }
  }
  return majoritySlice;
};

const listOtherHeaderSampleIds = (samples: TrainerSample[]): Set<string> => {
  const majoritySlice = majorityBitSlice({
    samples,
    startIndex: FRAME_VARIANT_BIT_INDEX,
    bitLength: FRAME_VARIANT_BIT_LENGTH,
  });
  if (!majoritySlice) {
    return new Set();
  }
  const majorityCount = samples.filter(
    (sample) =>
      sample.bits.slice(FRAME_VARIANT_BIT_INDEX, FRAME_VARIANT_BIT_INDEX + FRAME_VARIANT_BIT_LENGTH) ===
      majoritySlice,
  ).length;
  if (majorityCount <= samples.length / 2) {
    return new Set();
  }
  return new Set(
    samples
      .filter(
        (sample) =>
          sample.bits.slice(
            FRAME_VARIANT_BIT_INDEX,
            FRAME_VARIANT_BIT_INDEX + FRAME_VARIANT_BIT_LENGTH,
          ) !== majoritySlice,
      )
      .map((sample) => sample.id),
  );
};

const buildParamLookup = ({
  samples,
  paramId,
  bitIndexes,
  skipUnlockedParamIds,
}: {
  samples: TrainerSample[];
  paramId: string;
  bitIndexes: number[];
  skipUnlockedParamIds?: Set<string>;
}): Record<string, string> => {
  const lookup: Record<string, string> = {};
  for (const sample of samples) {
    if (skipUnlockedParamIds?.has(sample.unlockedParamId)) {
      continue;
    }
    const optionId = sample.paramValues[paramId];
    if (optionId === undefined) {
      continue;
    }
    lookup[optionId] = sliceBits(sample.bits, bitIndexes);
  }
  return lookup;
};

const listContiguousRuns = (bitIndexes: number[]): number[][] => {
  const runs: number[][] = [];
  let currentRun: number[] = [];
  for (const bitIndex of bitIndexes) {
    const previousIndex = currentRun.at(-1);
    if (previousIndex === undefined || bitIndex === previousIndex + 1) {
      currentRun.push(bitIndex);
    } else {
      runs.push(currentRun);
      currentRun = [bitIndex];
    }
  }
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }
  return runs;
};

const pickLinearBitIndexes = ({
  samples,
  paramId,
  bitIndexes,
  skipUnlockedParamIds,
}: {
  samples: TrainerSample[];
  paramId: string;
  bitIndexes: number[];
  skipUnlockedParamIds?: Set<string>;
}): { bitIndexes: number[]; extraChecksumIndexes: number[] } => {
  const fullLookup = buildParamLookup({ samples, paramId, bitIndexes, skipUnlockedParamIds });
  if (fieldKindForLookup(fullLookup) === 'linear') {
    return { bitIndexes, extraChecksumIndexes: [] };
  }
  const linearRuns = listContiguousRuns(bitIndexes).filter((run) => {
    const runLookup = buildParamLookup({ samples, paramId, bitIndexes: run, skipUnlockedParamIds });
    const optionIds = Object.keys(runLookup);
    const uniqueSlices = new Set(Object.values(runLookup));
    return (
      optionIds.length >= 3 &&
      uniqueSlices.size === optionIds.length &&
      fieldKindForLookup(runLookup) === 'linear'
    );
  });
  const bestRun = [...linearRuns].sort((left, right) => right.length - left.length)[0];
  if (!bestRun) {
    return { bitIndexes, extraChecksumIndexes: [] };
  }
  return {
    bitIndexes: bestRun,
    extraChecksumIndexes: bitIndexes.filter((index) => !bestRun.includes(index)),
  };
};

const listOtherLayoutSampleIds = (samples: TrainerSample[]): Set<string> => {
  if (samples.length < 2) {
    return new Set();
  }
  const neighborCounts = samples.map(
    (sample) =>
      samples.filter(
        (other) =>
          other.id !== sample.id &&
          compareIrBits({ left: sample.bits, right: other.bits }).length < LAYOUT_CHANGE_MIN_FLIPS,
      ).length,
  );
  const maxNeighborCount = Math.max(...neighborCounts);
  if (maxNeighborCount === 0) {
    return new Set();
  }
  const minNeighborCount = maxNeighborCount / 2;
  return new Set(
    samples
      .filter((_, index) => (neighborCounts[index] ?? 0) < minNeighborCount)
      .map((sample) => sample.id),
  );
};

export const listInconsistentSampleIds = (samples: TrainerSample[]): Set<string> => {
  const samplesByParamValues = new Map<string, TrainerSample[]>();
  for (const sample of samples) {
    const groupKey = serializeParamValues(sample.paramValues);
    const group = samplesByParamValues.get(groupKey) ?? [];
    group.push(sample);
    samplesByParamValues.set(groupKey, group);
  }
  const inconsistentSampleIds = new Set<string>();
  for (const group of samplesByParamValues.values()) {
    if (group.length < 2) {
      continue;
    }
    const countByBits = new Map<string, number>();
    for (const sample of group) {
      countByBits.set(sample.bits, (countByBits.get(sample.bits) ?? 0) + 1);
    }
    const canonicalSample = [...group].sort((left, right) => {
      const countDelta = (countByBits.get(right.bits) ?? 0) - (countByBits.get(left.bits) ?? 0);
      if (countDelta !== 0) {
        return countDelta;
      }
      return left.receivedAt.localeCompare(right.receivedAt);
    })[0];
    if (!canonicalSample) {
      continue;
    }
    for (const sample of group) {
      if (sample.id === canonicalSample.id) {
        continue;
      }
      const flipCount = compareIrBits({ left: sample.bits, right: canonicalSample.bits }).length;
      if (flipCount >= LAYOUT_CHANGE_MIN_FLIPS) {
        inconsistentSampleIds.add(sample.id);
      }
    }
  }
  return inconsistentSampleIds;
};

export const listMajorityLayoutSamples = (samples: TrainerSample[]): TrainerSample[] => {
  const decodedSamples = samples.filter((sample) => sample.bits && !sample.bits.includes('?'));
  const inconsistentSampleIds = listInconsistentSampleIds(decodedSamples);
  const consistentSamples = decodedSamples.filter((sample) => !inconsistentSampleIds.has(sample.id));
  const otherLayoutSampleIds = new Set([
    ...listOtherLayoutSampleIds(consistentSamples),
    ...listOtherHeaderSampleIds(consistentSamples),
  ]);
  return consistentSamples.filter((sample) => !otherLayoutSampleIds.has(sample.id));
};

export const inferTrainerFields = ({
  schema,
  samples,
}: {
  schema: TrainerSchema;
  samples: TrainerSample[];
}): TrainerInference => {
  const decodedSamples = samples.filter((sample) => sample.bits && !sample.bits.includes('?'));
  const inconsistentSampleIds = listInconsistentSampleIds(decodedSamples);
  const consistentSamples = decodedSamples.filter((sample) => !inconsistentSampleIds.has(sample.id));
  const otherLayoutSampleIds = new Set([
    ...listOtherLayoutSampleIds(consistentSamples),
    ...listOtherHeaderSampleIds(consistentSamples),
  ]);
  const usableSamples = listMajorityLayoutSamples(samples);
  const flipsByParamId: Record<string, Set<number>> = {};
  const leftoverFlipsByParamId: Record<string, Set<number>> = {};
  const layoutChangeParamIds = new Set<string>();
  const unresolved: string[] = [];
  if (inconsistentSampleIds.size > 0) {
    unresolved.push(
      `ignored ${inconsistentSampleIds.size} sample(s) with the same labels as another capture but a different frame`,
    );
  }
  if (otherLayoutSampleIds.size > 0) {
    unresolved.push(
      `ignored ${otherLayoutSampleIds.size} sample(s) that use a different frame layout`,
    );
    for (const param of schema.params) {
      const hasMajorityUnlock = usableSamples.some((sample) => sample.unlockedParamId === param.id);
      const hasOtherLayoutUnlock = consistentSamples.some(
        (sample) => otherLayoutSampleIds.has(sample.id) && sample.unlockedParamId === param.id,
      );
      if (hasOtherLayoutUnlock && !hasMajorityUnlock) {
        layoutChangeParamIds.add(param.id);
      }
    }
  }

  const addFlips = ({
    paramId,
    bitDiffs,
    target,
  }: {
    paramId: string;
    bitDiffs: { index: number }[];
    target: Record<string, Set<number>>;
  }): void => {
    const flipSet = target[paramId] ?? new Set<number>();
    for (const diff of bitDiffs) {
      flipSet.add(diff.index);
    }
    target[paramId] = flipSet;
  };

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
      if (bitDiffs.length >= LAYOUT_CHANGE_MIN_FLIPS) {
        if (hasSameParamKeys({ left: leftSample.paramValues, right: rightSample.paramValues })) {
          layoutChangeParamIds.add(paramId);
        }
        continue;
      }
      if (hasSameParamKeys({ left: leftSample.paramValues, right: rightSample.paramValues })) {
        addFlips({ paramId, bitDiffs, target: flipsByParamId });
        continue;
      }
      if (paramId === schema.primaryParamId) {
        addFlips({ paramId, bitDiffs, target: leftoverFlipsByParamId });
      }
    }
  }

  const axisFlipSets = Object.values(flipsByParamId).filter((flipSet) => flipSet.size > 0);
  const checksumSet = axisFlipSets.length >= 2 ? intersectSets(axisFlipSets) : new Set<number>();
  const knownFieldBits = new Set<number>(checksumSet);
  for (const flipSet of Object.values(flipsByParamId)) {
    for (const bitIndex of flipSet) {
      if (!checksumSet.has(bitIndex)) {
        knownFieldBits.add(bitIndex);
      }
    }
  }
  const modeFlipSet = leftoverFlipsByParamId[schema.primaryParamId] ?? new Set<number>();
  const modeUnique = new Set(
    [...modeFlipSet].filter((bitIndex) => !knownFieldBits.has(bitIndex)),
  );
  if (modeUnique.size > 0) {
    flipsByParamId[schema.primaryParamId] = new Set([
      ...(flipsByParamId[schema.primaryParamId] ?? []),
      ...modeUnique,
    ]);
  }

  const fields: TrainerParamField[] = schema.params.map((param) => {
    if (isSeparateCommandParam(param)) {
      const reason = 'separate command — not part of the mode frame';
      unresolved.push(`${param.id}: ${reason}`);
      return {
        paramId: param.id,
        bitIndexes: [],
        kind: 'unresolved',
        lookup: {},
        unresolvedReason: reason,
      };
    }
    const rawIndexes = [...(flipsByParamId[param.id] ?? [])].sort((left, right) => left - right);
    const bitIndexes = rawIndexes.filter((index) => !checksumSet.has(index));
    const hasAxisPairs = (flipsByParamId[param.id]?.size ?? 0) > 0;
    if (bitIndexes.length === 0) {
      const reason = layoutChangeParamIds.has(param.id)
        ? 'changes too many bits to be one field (likely a different frame layout)'
        : hasAxisPairs
          ? 'No unique bits after removing checksum'
          : 'No pair that changes only this param';
      unresolved.push(`${param.id}: ${reason}`);
      return {
        paramId: param.id,
        bitIndexes: [],
        kind: 'unresolved',
        lookup: {},
        unresolvedReason: reason,
      };
    }
    const lookup = buildParamLookup({
      samples: usableSamples,
      paramId: param.id,
      bitIndexes,
      skipUnlockedParamIds: layoutChangeParamIds,
    });
    return {
      paramId: param.id,
      bitIndexes,
      kind: fieldKindForLookup(lookup),
      lookup,
    };
  });
  for (const field of fields) {
    if (field.kind === 'unresolved') {
      continue;
    }
    const shrunk = pickLinearBitIndexes({
      samples: usableSamples,
      paramId: field.paramId,
      bitIndexes: field.bitIndexes,
      skipUnlockedParamIds: layoutChangeParamIds,
    });
    if (shrunk.extraChecksumIndexes.length === 0) {
      continue;
    }
    for (const bitIndex of shrunk.extraChecksumIndexes) {
      checksumSet.add(bitIndex);
    }
    field.bitIndexes = shrunk.bitIndexes;
    field.lookup = buildParamLookup({
      samples: usableSamples,
      paramId: field.paramId,
      bitIndexes: field.bitIndexes,
      skipUnlockedParamIds: layoutChangeParamIds,
    });
    field.kind = fieldKindForLookup(field.lookup);
  }
  const checksumIndexes = [...checksumSet].sort((left, right) => left - right);

  const disabledNotes: TrainerDisabledNote[] = [];
  const primaryParam = schema.params.find((param) => param.id === schema.primaryParamId);
  for (const primaryOption of primaryParam?.options ?? []) {
    const constraints = schema.constraints[primaryOption.id] ?? {};
    for (const [paramId, constraint] of Object.entries(constraints)) {
      if (constraint.kind !== 'off') {
        continue;
      }
      const constraintParam = schema.params.find((item) => item.id === paramId);
      if (constraintParam && isSeparateCommandParam(constraintParam)) {
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
