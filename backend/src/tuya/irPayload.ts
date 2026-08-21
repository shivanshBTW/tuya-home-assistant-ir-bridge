import type { CatalogButton } from '../types.js';

export interface TuyaKeyItem {
  key?: string;
  key_name?: string;
  key_id?: number | string;
  code?: string;
  standard_key?: boolean;
}

export interface TuyaKeysResult {
  key_list?: TuyaKeyItem[];
  category_id?: number;
  brand_id?: number;
  remote_index?: number;
}

export interface TuyaLearnedCode {
  id?: string | number;
  learn_id?: string | number;
  key?: string;
  key_name?: string;
  code?: string;
  remote_id?: string;
}

export interface TuyaCodeLibraryRule {
  key?: string;
  key_name?: string;
  key_id?: number | string;
  code?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const asObjectList = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  for (const key of ['key_list', 'list', 'rules', 'codes', 'result'] as const) {
    if (record[key] !== undefined) {
      return asObjectList(record[key]);
    }
  }
  return [];
};

export const parseKeysResult = (value: unknown): TuyaKeysResult => {
  const record = asRecord(value);
  const keyList = Array.isArray(value)
    ? (asObjectList(value) as TuyaKeyItem[])
    : Array.isArray(record?.key_list)
      ? (record.key_list as TuyaKeyItem[])
      : (asObjectList(value) as TuyaKeyItem[]);
  return {
    key_list: keyList,
    category_id: typeof record?.category_id === 'number' ? record.category_id : undefined,
    brand_id: typeof record?.brand_id === 'number' ? record.brand_id : undefined,
    remote_index: typeof record?.remote_index === 'number' ? record.remote_index : undefined,
  };
};

export const parseLearnedCodes = (value: unknown): TuyaLearnedCode[] => {
  return asObjectList(value) as TuyaLearnedCode[];
};

export const parseCodeLibraryRules = (value: unknown): TuyaCodeLibraryRule[] => {
  return asObjectList(value) as TuyaCodeLibraryRule[];
};

const readCode = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
};

export const flattenButtonsFromIrPayloads = ({
  remoteId,
  keys,
  learningCodes,
  codeLibrary,
}: {
  remoteId: string;
  keys: unknown;
  learningCodes: unknown;
  codeLibrary?: unknown;
}): CatalogButton[] => {
  const buttons: CatalogButton[] = [];
  const buttonByKey: Record<string, CatalogButton> = {};

  const addButton = (button: CatalogButton): void => {
    const existing = buttonByKey[button.key];
    if (!existing) {
      buttonByKey[button.key] = button;
      buttons.push(button);
      return;
    }
    if (!existing.code && button.code) {
      existing.code = button.code;
      existing.raw = button.raw;
      if (button.source === 'learned') {
        existing.source = 'learned';
      }
    }
  };

  const keysResult = parseKeysResult(keys);
  for (const [keyIndex, keyItem] of (keysResult.key_list ?? []).entries()) {
    const key = String(keyItem.key ?? `key_${keyIndex}`);
    addButton({
      id: `${remoteId}:key:${key}:${keyItem.key_id ?? keyIndex}`,
      remoteId,
      key,
      keyName: String(keyItem.key_name ?? key),
      code: readCode(keyItem.code),
      source: 'key',
      raw: keyItem,
    });
  }

  for (const [ruleIndex, rule] of parseCodeLibraryRules(codeLibrary).entries()) {
    const key = String(rule.key ?? `library_${ruleIndex}`);
    addButton({
      id: `${remoteId}:library:${key}:${rule.key_id ?? ruleIndex}`,
      remoteId,
      key,
      keyName: String(rule.key_name ?? key),
      code: readCode(rule.code),
      source: 'key',
      raw: rule,
    });
  }

  for (const [learnedIndex, learned] of parseLearnedCodes(learningCodes).entries()) {
    const key = String(learned.key ?? `learned_${learnedIndex}`);
    addButton({
      id: `${remoteId}:learned:${learned.learn_id ?? learned.id ?? learnedIndex}`,
      remoteId,
      key,
      keyName: String(learned.key_name ?? key),
      code: readCode(learned.code),
      source: 'learned',
      raw: learned,
    });
  }

  return buttons;
};
