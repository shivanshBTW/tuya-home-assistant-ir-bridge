export const IR_CARRIER_FREQUENCY_KHZ = 38;
export const IR_NEC_BIT_TIME_US = 562;
export const IR_NEC_ZERO_TIME_US = 562;
export const IR_NEC_ONE_TIME_US = 1687;
export const IR_HEAD_BIT_TIME_TYPE = 1;

const TUYA_KEY_SYMBOL_PATTERN = /[@#$%^&*(){}[\]<>|~]/;
const HEX_CODE_PATTERN = /^[0-9A-Fa-f]+$/;
const LEARNED_KEY1_PREFIX = '1';
const LIBRARY_KEY1_PREFIX = '0';
const MIN_HEX_CODE_LENGTH = 2;
const DEVICE_LOG_KEY_PREFIX = /^[01][01]/;

export type CatalogIrCodeKind = 'cloud_hex' | 'symbol_key' | 'lan_base64';

export interface LocalIrFrame {
  head: string;
  key1: string;
}

export const classifyCatalogIrCode = (code: string): CatalogIrCodeKind => {
  if (TUYA_KEY_SYMBOL_PATTERN.test(code)) {
    return 'symbol_key';
  }
  if (
    code.length >= MIN_HEX_CODE_LENGTH &&
    code.length % 2 === 0 &&
    HEX_CODE_PATTERN.test(code)
  ) {
    return 'cloud_hex';
  }
  return 'lan_base64';
};

const stripDeviceLogKeyPrefix = (code: string): string => {
  if (DEVICE_LOG_KEY_PREFIX.test(code) && code.length > 2) {
    return code.slice(1);
  }
  return code;
};

const stripLearnedKey1Prefix = (code: string): string => {
  if (code.startsWith(LEARNED_KEY1_PREFIX) && code.length > 1) {
    return code.slice(1);
  }
  return code;
};

const toHexField = (value: number, width: number): string => {
  return value.toString(16).toUpperCase().padStart(width, '0');
};

export const buildDefaultIrHead = (): string => {
  const frequencyHundredths = Math.round(IR_CARRIER_FREQUENCY_KHZ * 100);
  const timeBaseUs = 100_000 / frequencyHundredths;
  const bitTime = Math.round(IR_NEC_BIT_TIME_US / timeBaseUs);
  const zeroTime = Math.round(IR_NEC_ZERO_TIME_US / timeBaseUs);
  const oneTime = Math.round(IR_NEC_ONE_TIME_US / timeBaseUs);
  const timingCount = 3;
  return (
    toHexField(IR_HEAD_BIT_TIME_TYPE, 2) +
    toHexField(frequencyHundredths, 4) +
    '0000000000' +
    toHexField(timingCount, 2) +
    toHexField(bitTime, 4) +
    toHexField(zeroTime, 4) +
    toHexField(oneTime, 4)
  );
};

export const catalogCodeToLocalIrFrame = (code: string): LocalIrFrame => {
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error('IR code is empty');
  }

  const kind = classifyCatalogIrCode(trimmedCode);
  if (kind === 'cloud_hex') {
    const lanBase64 = Buffer.from(trimmedCode, 'hex').toString('base64');
    return { head: '', key1: `${LEARNED_KEY1_PREFIX}${lanBase64}` };
  }
  if (kind === 'symbol_key') {
    const key = stripDeviceLogKeyPrefix(trimmedCode);
    return {
      head: buildDefaultIrHead(),
      key1: `${LIBRARY_KEY1_PREFIX}${key}`,
    };
  }

  const lanBase64 = stripLearnedKey1Prefix(trimmedCode);
  return { head: '', key1: `${LEARNED_KEY1_PREFIX}${lanBase64}` };
};
