import type { IrDecode, IrPulseDiff } from '../types.js';
import { classifyCatalogIrCode, type CatalogIrCodeKind } from './irFrame.js';

const LEARNED_KEY1_PREFIX = '1';

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
    return {
      kind,
      pulses,
      pulseCount: pulses.length,
      hex: trimmedCode.toUpperCase(),
      base64: pulsesToBase64(pulses),
    };
  }
  if (kind === 'lan_base64') {
    const pulses = base64ToPulses(trimmedCode);
    return {
      kind,
      pulses,
      pulseCount: pulses.length,
      hex: pulsesToHex(pulses),
      base64: stripLearnedKey1Prefix(trimmedCode),
    };
  }
  return {
    kind,
    pulses: [],
    pulseCount: 0,
    hex: '',
    base64: '',
  };
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
