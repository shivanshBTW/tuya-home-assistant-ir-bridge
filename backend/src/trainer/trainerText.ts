import type { CatalogIrCodeKind } from '../tuya/irFrame.js';
import {
  bitsToPulses,
  decodeIrCode,
  parseIrBitString,
  pulsesToBits,
  pulsesToHex,
} from '../tuya/irDecode.js';

export interface TrainerDecodedText {
  bits: string;
  kind: CatalogIrCodeKind;
  pulseCount: number;
  code: string;
}

const WHITESPACE_PATTERN = /\s+/;
const INTEGER_TOKEN_PATTERN = /^\d+$/;
const BIT_TOKEN_PATTERN = /^[01]$/;

const assertUsableBits = (bits: string): void => {
  if (!bits || bits.includes('?')) {
    throw new Error('Pasted payload did not decode to usable 0/1 bits');
  }
};

export const decodeTrainerText = (text: string): TrainerDecodedText => {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('text is required');
  }

  try {
    const bits = parseIrBitString(trimmedText);
    assertUsableBits(bits);
    const pulses = bitsToPulses(bits);
    return {
      bits,
      kind: 'cloud_hex',
      pulseCount: pulses.length,
      code: pulsesToHex(pulses),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Pasted payload did not decode to usable 0/1 bits') {
      throw error;
    }
  }

  const tokens = trimmedText.split(WHITESPACE_PATTERN);
  const isPulseList =
    tokens.length >= 4 &&
    tokens.every((token) => INTEGER_TOKEN_PATTERN.test(token)) &&
    tokens.some((token) => !BIT_TOKEN_PATTERN.test(token));
  if (isPulseList) {
    const pulses = tokens.map((token) => Number(token));
    const bits = pulsesToBits(pulses);
    assertUsableBits(bits);
    return {
      bits,
      kind: 'cloud_hex',
      pulseCount: pulses.length,
      code: pulsesToHex(pulses),
    };
  }

  const decode = decodeIrCode(trimmedText);
  assertUsableBits(decode.bits);
  return {
    bits: decode.bits,
    kind: decode.kind,
    pulseCount: decode.pulseCount,
    code: trimmedText,
  };
};
