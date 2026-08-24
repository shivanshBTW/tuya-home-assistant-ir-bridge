import type { IrBitDiff, IrDecode, IrPulseDiff } from '../types.js';
import { classifyCatalogIrCode, type CatalogIrCodeKind } from './irFrame.js';

const LEARNED_KEY1_PREFIX = '1';
export const IR_LONG_MIN_US = 1000;
export const IR_HEADER_MIN_US = 2000;
export const IR_TRAILER_MIN_US = 8000;
export const IR_LG_HEADER_MARK_US = 3063;
export const IR_LG_HEADER_SPACE_US = 9841;
export const IR_LG_SHORT_US = 512;
export const IR_LG_LONG_US = 1576;
export const IR_LG_TRAILER_US = 30_000;
const IR_BIT_WHITESPACE_PATTERN = /[\s]+/g;
const IR_BIT_PATTERN = /^[01]+$/;

export type IrPulseSymbol = 'S' | 'L' | 'M' | 'H';

export const quantizeIrPulseUs = (pulseUs: number): IrPulseSymbol => {
  if (pulseUs >= IR_TRAILER_MIN_US) {
    return 'H';
  }
  if (pulseUs >= IR_HEADER_MIN_US) {
    return 'M';
  }
  if (pulseUs >= IR_LONG_MIN_US) {
    return 'L';
  }
  return 'S';
};

export const pulsesToSymbols = (pulses: number[]): string => {
  return pulses.map(quantizeIrPulseUs).join('');
};

export const pulsesToBits = (pulses: number[]): string => {
  let startIndex = 0;
  while (
    startIndex < pulses.length &&
    (quantizeIrPulseUs(pulses[startIndex] ?? 0) === 'M' ||
      quantizeIrPulseUs(pulses[startIndex] ?? 0) === 'H')
  ) {
    startIndex += 1;
  }
  let endIndex = pulses.length;
  while (endIndex > startIndex && quantizeIrPulseUs(pulses[endIndex - 1] ?? 0) === 'H') {
    endIndex -= 1;
  }

  const bits: string[] = [];
  let pulseIndex = startIndex;
  while (pulseIndex + 1 < endIndex) {
    const mark = quantizeIrPulseUs(pulses[pulseIndex] ?? 0);
    const space = quantizeIrPulseUs(pulses[pulseIndex + 1] ?? 0);
    if (mark === 'S' && (space === 'S' || space === 'L')) {
      bits.push(space === 'L' ? '1' : '0');
      pulseIndex += 2;
      continue;
    }
    bits.push('?');
    pulseIndex += 1;
  }
  return bits.join('');
};

export const parseIrBitString = (bits: string): string => {
  const compactBits = bits.replace(IR_BIT_WHITESPACE_PATTERN, '');
  if (!IR_BIT_PATTERN.test(compactBits)) {
    throw new Error('bits must be a 0/1 string');
  }
  return compactBits;
};

export const bitsToPulses = (bits: string): number[] => {
  const compactBits = parseIrBitString(bits);
  const pulses = [IR_LG_HEADER_MARK_US, IR_LG_HEADER_SPACE_US];
  for (const bit of compactBits) {
    pulses.push(IR_LG_SHORT_US, bit === '1' ? IR_LG_LONG_US : IR_LG_SHORT_US);
  }
  pulses.push(IR_LG_TRAILER_US);
  return pulses;
};

const decodeFromPulses = ({
  kind,
  pulses,
  hex,
  base64,
}: {
  kind: CatalogIrCodeKind;
  pulses: number[];
  hex: string;
  base64: string;
}): IrDecode => {
  return {
    kind,
    pulses,
    pulseCount: pulses.length,
    hex,
    base64,
    symbols: pulsesToSymbols(pulses),
    bits: pulsesToBits(pulses),
  };
};

const readUint16Pulses = (raw: Buffer): number[] => {
  const pulses: number[] = [];
  for (let offset = 0; offset + 1 < raw.length; offset += 2) {
    pulses.push(raw.readUInt16LE(offset));
  }
  return pulses;
};

const writeUint16Pulses = (pulses: number[]): Buffer => {
  const raw = Buffer.alloc(pulses.length * 2);
  for (const [pulseIndex, pulse] of pulses.entries()) {
    raw.writeUInt16LE(pulse & 0xffff, pulseIndex * 2);
  }
  return raw;
};

const stripLearnedKey1Prefix = (code: string): string => {
  if (code.startsWith(LEARNED_KEY1_PREFIX) && code.length > 1) {
    return code.slice(1);
  }
  return code;
};

export const hexToPulses = (codeHex: string): number[] => {
  return readUint16Pulses(Buffer.from(codeHex, 'hex'));
};

export const base64ToPulses = (codeBase64: string): number[] => {
  let blob = codeBase64;
  if (blob.startsWith(LEARNED_KEY1_PREFIX) && blob.length % 4 === 1) {
    blob = blob.slice(1);
  } else {
    blob = stripLearnedKey1Prefix(blob);
  }
  return readUint16Pulses(Buffer.from(blob, 'base64'));
};

export const pulsesToHex = (pulses: number[]): string => {
  return writeUint16Pulses(pulses).toString('hex').toUpperCase();
};

export const pulsesToBase64 = (pulses: number[]): string => {
  return writeUint16Pulses(pulses).toString('base64');
};

export const decodeIrCode = (code: string): IrDecode => {
  const trimmedCode = code.trim();
  const kind: CatalogIrCodeKind = classifyCatalogIrCode(trimmedCode);
  if (kind === 'cloud_hex') {
    const pulses = hexToPulses(trimmedCode);
    return decodeFromPulses({
      kind,
      pulses,
      hex: trimmedCode.toUpperCase(),
      base64: pulsesToBase64(pulses),
    });
  }
  if (kind === 'lan_base64') {
    const pulses = base64ToPulses(trimmedCode);
    return decodeFromPulses({
      kind,
      pulses,
      hex: pulsesToHex(pulses),
      base64: stripLearnedKey1Prefix(trimmedCode),
    });
  }
  return decodeFromPulses({
    kind,
    pulses: [],
    hex: '',
    base64: '',
  });
};

export const compareIrPulses = ({
  left,
  right,
}: {
  left: number[];
  right: number[];
}): IrPulseDiff[] => {
  const length = Math.max(left.length, right.length);
  const diffs: IrPulseDiff[] = [];
  for (let index = 0; index < length; index += 1) {
    const leftPulse = left[index];
    const rightPulse = right[index];
    const leftSymbol = leftPulse === undefined ? undefined : quantizeIrPulseUs(leftPulse);
    const rightSymbol = rightPulse === undefined ? undefined : quantizeIrPulseUs(rightPulse);
    if (leftSymbol !== rightSymbol) {
      diffs.push({
        index,
        ...(leftPulse === undefined ? {} : { left: leftPulse }),
        ...(rightPulse === undefined ? {} : { right: rightPulse }),
      });
    }
  }
  return diffs;
};

export const compareIrBits = ({ left, right }: { left: string; right: string }): IrBitDiff[] => {
  const length = Math.max(left.length, right.length);
  const diffs: IrBitDiff[] = [];
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      diffs.push({
        index,
        ...(left[index] === undefined ? {} : { left: left[index] }),
        ...(right[index] === undefined ? {} : { right: right[index] }),
      });
    }
  }
  return diffs;
};
