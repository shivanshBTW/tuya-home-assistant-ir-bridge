import type {
  TrainerChecksumKind,
  TrainerDisabledNote,
  TrainerGeneratedCell,
  TrainerGeneration,
  TrainerInference,
  TrainerParamField,
  TrainerSample,
  TrainerSchema,
} from '../types.js';
import { listMajorityLayoutSamples } from './trainerInfer.js';
import {
  formatTrainerStateLabel,
  listLegalTrainerStates,
  trainerStateId,
} from './trainerPlan.js';

const NIBBLE_LENGTH = 4;
const CONSTANT_SLICE_PATTERN = /stays\s+([01]+)/;

const parseBinaryInt = (bits: string): number | undefined => {
  if (!bits || /[^01]/.test(bits)) {
    return undefined;
  }
  return Number.parseInt(bits, 2);
};

const writeBitSlice = ({
  bits,
  bitIndexes,
  value,
}: {
  bits: string;
  bitIndexes: number[];
  value: string;
}): string | undefined => {
  if (value.length !== bitIndexes.length) {
    return undefined;
  }
  if (bitIndexes.some((bitIndex) => bitIndex < 0 || bitIndex >= bits.length)) {
    return undefined;
  }
  const nextBits = [...bits];
  for (const [valueIndex, bitIndex] of bitIndexes.entries()) {
    const bit = value[valueIndex];
    if (bit === undefined || bitIndex === undefined) {
      return undefined;
    }
    nextBits[bitIndex] = bit;
  }
  return nextBits.join('');
};

const encodeLinearBits = ({
  lookup,
  optionId,
  bitLength,
}: {
  lookup: Record<string, string>;
  optionId: string;
  bitLength: number;
}): string | undefined => {
  if (!/^-?\d+$/.test(optionId)) {
    return undefined;
  }
  const points = Object.entries(lookup)
    .filter(([lookupOptionId]) => /^-?\d+$/.test(lookupOptionId))
    .map(([lookupOptionId, bits]) => ({
      optionNumber: Number(lookupOptionId),
      bitNumber: parseBinaryInt(bits),
    }))
    .filter(
      (point): point is { optionNumber: number; bitNumber: number } => point.bitNumber !== undefined,
    )
    .sort((left, right) => left.optionNumber - right.optionNumber);
  const firstPoint = points[0];
  const secondPoint = points[1];
  if (!firstPoint || !secondPoint) {
    return undefined;
  }
  const optionStep = secondPoint.optionNumber - firstPoint.optionNumber;
  const bitStep = secondPoint.bitNumber - firstPoint.bitNumber;
  if (optionStep === 0) {
    return undefined;
  }
  const optionNumber = Number(optionId);
  const expected =
    firstPoint.bitNumber + ((optionNumber - firstPoint.optionNumber) * bitStep) / optionStep;
  if (!Number.isInteger(expected) || expected < 0) {
    return undefined;
  }
  const encoded = expected.toString(2).padStart(bitLength, '0');
  if (encoded.length !== bitLength) {
    return undefined;
  }
  return encoded;
};

const encodeFieldBits = ({
  field,
  optionId,
}: {
  field: TrainerParamField;
  optionId: string;
}): string | undefined => {
  if (field.kind === 'unresolved' || field.bitIndexes.length === 0) {
    return undefined;
  }
  const lookupBits = field.lookup[optionId];
  if (lookupBits && lookupBits.length === field.bitIndexes.length) {
    return lookupBits;
  }
  if (field.kind === 'linear') {
    return encodeLinearBits({
      lookup: field.lookup,
      optionId,
      bitLength: field.bitIndexes.length,
    });
  }
  return undefined;
};

const listPayloadNibbles = (bits: string): string[] | undefined => {
  if (bits.length < NIBBLE_LENGTH || bits.length % NIBBLE_LENGTH !== 0) {
    return undefined;
  }
  const nibbles: string[] = [];
  for (let startIndex = 0; startIndex < bits.length - NIBBLE_LENGTH; startIndex += NIBBLE_LENGTH) {
    nibbles.push(bits.slice(startIndex, startIndex + NIBBLE_LENGTH));
  }
  return nibbles;
};

const nibbleSumBits = (nibbles: string[]): string | undefined => {
  let total = 0;
  for (const nibble of nibbles) {
    const nibbleNumber = parseBinaryInt(nibble);
    if (nibbleNumber === undefined) {
      return undefined;
    }
    total += nibbleNumber;
  }
  return (total & 0xf).toString(2).padStart(NIBBLE_LENGTH, '0');
};

const nibbleXorBits = (nibbles: string[]): string | undefined => {
  let total = 0;
  for (const nibble of nibbles) {
    const nibbleNumber = parseBinaryInt(nibble);
    if (nibbleNumber === undefined) {
      return undefined;
    }
    total ^= nibbleNumber;
  }
  return total.toString(2).padStart(NIBBLE_LENGTH, '0');
};

const isTrailingChecksumNibble = ({
  bitLength,
  checksumIndexes,
}: {
  bitLength: number;
  checksumIndexes: number[];
}): boolean => {
  if (bitLength < NIBBLE_LENGTH || checksumIndexes.length !== NIBBLE_LENGTH) {
    return false;
  }
  const expectedIndexes = [
    bitLength - 4,
    bitLength - 3,
    bitLength - 2,
    bitLength - 1,
  ];
  return expectedIndexes.every((bitIndex, index) => checksumIndexes[index] === bitIndex);
};

export const inferTrainerChecksumKind = ({
  samples,
  checksumIndexes,
}: {
  samples: TrainerSample[];
  checksumIndexes: number[];
}): TrainerChecksumKind => {
  if (samples.length === 0) {
    return 'unknown';
  }
  const bitLength = samples[0]?.bits.length ?? 0;
  const hasNibbleAlignedFrame = bitLength >= NIBBLE_LENGTH && bitLength % NIBBLE_LENGTH === 0;
  if (
    !hasNibbleAlignedFrame &&
    !isTrailingChecksumNibble({ bitLength, checksumIndexes })
  ) {
    return 'unknown';
  }
  const expectedByKind: Record<Exclude<TrainerChecksumKind, 'unknown'>, boolean> = {
    nibble_sum: true,
    nibble_xor: true,
  };
  for (const sample of samples) {
    if (sample.bits.length !== bitLength) {
      return 'unknown';
    }
    const nibbles = listPayloadNibbles(sample.bits);
    if (!nibbles) {
      return 'unknown';
    }
    const actualChecksum = sample.bits.slice(bitLength - NIBBLE_LENGTH);
    if (nibbleSumBits(nibbles) !== actualChecksum) {
      expectedByKind.nibble_sum = false;
    }
    if (nibbleXorBits(nibbles) !== actualChecksum) {
      expectedByKind.nibble_xor = false;
    }
  }
  if (expectedByKind.nibble_sum) {
    return 'nibble_sum';
  }
  if (expectedByKind.nibble_xor) {
    return 'nibble_xor';
  }
  return 'unknown';
};

const applyChecksum = ({
  bits,
  checksumKind,
}: {
  bits: string;
  checksumKind: TrainerChecksumKind;
}): string | undefined => {
  const nibbles = listPayloadNibbles(bits);
  if (!nibbles) {
    return undefined;
  }
  const checksumBits =
    checksumKind === 'nibble_sum'
      ? nibbleSumBits(nibbles)
      : checksumKind === 'nibble_xor'
        ? nibbleXorBits(nibbles)
        : undefined;
  if (!checksumBits) {
    return undefined;
  }
  return `${bits.slice(0, bits.length - NIBBLE_LENGTH)}${checksumBits}`;
};

const findTemplateSample = ({
  samples,
  schema,
  paramValues,
}: {
  samples: TrainerSample[];
  schema: TrainerSchema;
  paramValues: Record<string, string>;
}): TrainerSample | undefined => {
  const primaryOptionId = paramValues[schema.primaryParamId];
  const scoredSamples = samples.map((sample) => {
    const sharedParamIds = Object.keys(paramValues).filter(
      (paramId) => sample.paramValues[paramId] !== undefined,
    );
    const matchCount = sharedParamIds.filter(
      (paramId) => sample.paramValues[paramId] === paramValues[paramId],
    ).length;
    const hasSamePrimary = sample.paramValues[schema.primaryParamId] === primaryOptionId;
    return { sample, matchCount, hasSamePrimary };
  });
  return [...scoredSamples].sort((left, right) => {
    if (left.hasSamePrimary !== right.hasSamePrimary) {
      return left.hasSamePrimary ? -1 : 1;
    }
    return right.matchCount - left.matchCount;
  })[0]?.sample;
};

const findMatchingSample = ({
  samples,
  paramValues,
}: {
  samples: TrainerSample[];
  paramValues: Record<string, string>;
}): TrainerSample | undefined => {
  return samples.find((sample) => {
    const paramIds = new Set([...Object.keys(sample.paramValues), ...Object.keys(paramValues)]);
    return [...paramIds].every((paramId) => sample.paramValues[paramId] === paramValues[paramId]);
  });
};

const constantSliceFromNote = (note: TrainerDisabledNote | undefined): string | undefined => {
  const match = note?.detail?.match(CONSTANT_SLICE_PATTERN);
  return match?.[1];
};

const overlayGeneratedBits = ({
  schema,
  inference,
  paramValues,
  templateBits,
  checksumKind,
}: {
  schema: TrainerSchema;
  inference: TrainerInference;
  paramValues: Record<string, string>;
  templateBits: string;
  checksumKind: TrainerChecksumKind;
}): { bits?: string; needsInputReason?: string } => {
  let nextBits = templateBits;
  const checksumIndexSet =
    checksumKind === 'unknown'
      ? new Set<number>()
      : new Set([
          templateBits.length - 4,
          templateBits.length - 3,
          templateBits.length - 2,
          templateBits.length - 1,
        ]);
  const writeFieldBits = ({
    bitIndexes,
    value,
  }: {
    bitIndexes: number[];
    value: string;
  }): string | undefined => {
    const keptIndexes: number[] = [];
    let keptValue = '';
    for (const [valueIndex, bitIndex] of bitIndexes.entries()) {
      if (checksumIndexSet.has(bitIndex)) {
        continue;
      }
      const bit = value[valueIndex];
      if (bit === undefined || bitIndex === undefined) {
        return undefined;
      }
      keptIndexes.push(bitIndex);
      keptValue += bit;
    }
    if (keptIndexes.length === 0) {
      return nextBits;
    }
    return writeBitSlice({ bits: nextBits, bitIndexes: keptIndexes, value: keptValue });
  };
  const primaryOptionId = paramValues[schema.primaryParamId];
  if (!primaryOptionId) {
    return { needsInputReason: 'Primary mode is missing' };
  }
  for (const field of inference.fields) {
    const optionId = paramValues[field.paramId];
    if (optionId !== undefined) {
      if (field.kind === 'unresolved') {
        continue;
      }
      const encodedBits = encodeFieldBits({ field, optionId });
      if (!encodedBits) {
        const paramLabel = schema.params.find((param) => param.id === field.paramId)?.label ?? field.paramId;
        return { needsInputReason: `${paramLabel} ${optionId} has no encoding yet` };
      }
      const writtenBits = writeFieldBits({
        bitIndexes: field.bitIndexes,
        value: encodedBits,
      });
      if (!writtenBits) {
        return { needsInputReason: `Could not write ${field.paramId}` };
      }
      nextBits = writtenBits;
      continue;
    }
    if (field.kind === 'unresolved' || field.bitIndexes.length === 0) {
      continue;
    }
    const note = inference.disabledNotes.find(
      (item) => item.primaryOptionId === primaryOptionId && item.paramId === field.paramId,
    );
    const constantBits = constantSliceFromNote(note);
    const payloadIndexes = field.bitIndexes.filter((bitIndex) => !checksumIndexSet.has(bitIndex));
    const encodedBits =
      constantBits && constantBits.length === payloadIndexes.length
        ? constantBits
        : constantBits && constantBits.length === field.bitIndexes.length
          ? constantBits
          : encodeFieldBits({ field, optionId: schema.anchorValues[field.paramId] ?? '' });
    if (!encodedBits) {
      continue;
    }
    const writtenBits = writeFieldBits({
      bitIndexes:
        constantBits && constantBits.length === payloadIndexes.length
          ? payloadIndexes
          : field.bitIndexes,
      value: encodedBits,
    });
    if (writtenBits) {
      nextBits = writtenBits;
    }
  }
  if (checksumKind === 'unknown') {
    return { needsInputReason: 'Checksum formula is unknown' };
  }
  const bitsWithChecksum = applyChecksum({ bits: nextBits, checksumKind });
  if (!bitsWithChecksum) {
    return { needsInputReason: 'Could not write checksum' };
  }
  return { bits: bitsWithChecksum };
};

const unresolvedNeedsInputReason = ({
  schema,
  inference,
  paramValues,
  templateSample,
}: {
  schema: TrainerSchema;
  inference: TrainerInference;
  paramValues: Record<string, string>;
  templateSample: TrainerSample;
}): string | undefined => {
  for (const field of inference.fields) {
    if (field.kind !== 'unresolved') {
      continue;
    }
    const optionId = paramValues[field.paramId];
    if (!optionId) {
      continue;
    }
    const templateOptionId = templateSample.paramValues[field.paramId];
    if (templateOptionId === optionId) {
      continue;
    }
    if (templateOptionId === undefined && optionId === schema.anchorValues[field.paramId]) {
      continue;
    }
    const paramLabel = schema.params.find((param) => param.id === field.paramId)?.label ?? field.paramId;
    const optionLabel =
      schema.params.find((param) => param.id === field.paramId)?.options.find((option) => option.id === optionId)
        ?.label ?? optionId;
    return `${paramLabel} ${optionLabel} uses a different frame — capture this combo`;
  }
  return undefined;
};

export const generateTrainerGrid = ({
  schema,
  samples,
  inference,
}: {
  schema: TrainerSchema;
  samples: TrainerSample[];
  inference?: TrainerInference;
}): TrainerGeneration => {
  if (!inference) {
    return { checksumKind: 'unknown', cells: [] };
  }
  const majoritySamples = listMajorityLayoutSamples(samples);
  const checksumKind = inferTrainerChecksumKind({
    samples: majoritySamples,
    checksumIndexes: inference.checksumIndexes,
  });
  const cells: TrainerGeneratedCell[] = listLegalTrainerStates(schema).map((paramValues) => {
    const id = trainerStateId(paramValues);
    const label = formatTrainerStateLabel({ schema, paramValues });
    const templateSample = findTemplateSample({
      samples: majoritySamples.length > 0 ? majoritySamples : samples.filter((sample) => sample.bits),
      schema,
      paramValues,
    });
    const leftoverCapture = findMatchingSample({ samples, paramValues });
    const unresolvedReason = templateSample
      ? unresolvedNeedsInputReason({ schema, inference, paramValues, templateSample })
      : 'No usable captured frame to start from';
    if (unresolvedReason) {
      if (leftoverCapture) {
        return {
          id,
          paramValues,
          label,
          status: 'captured',
          bits: leftoverCapture.bits,
        };
      }
      return {
        id,
        paramValues,
        label,
        status: 'needs_input',
        needsInputReason: unresolvedReason,
      };
    }
    if (!templateSample) {
      return {
        id,
        paramValues,
        label,
        status: 'needs_input',
        needsInputReason: 'No usable captured frame to start from',
      };
    }
    const generated = overlayGeneratedBits({
      schema,
      inference,
      paramValues,
      templateBits: templateSample.bits,
      checksumKind,
    });
    if (generated.bits) {
      return {
        id,
        paramValues,
        label,
        status: 'generated',
        bits: generated.bits,
      };
    }
    if (leftoverCapture) {
      return {
        id,
        paramValues,
        label,
        status: 'captured',
        bits: leftoverCapture.bits,
      };
    }
    return {
      id,
      paramValues,
      label,
      status: 'needs_input',
      needsInputReason: generated.needsInputReason ?? 'Could not generate this combo',
    };
  });
  return { checksumKind, cells };
};

