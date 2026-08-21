const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

const isUsefulKeyToken = (key: string): boolean => {
  return /^[a-z][a-z0-9_]{1,32}$/i.test(key);
};

const toKeyLabel = (key: string): string => {
  if (key.length <= 3 && /^[a-z]+$/i.test(key)) {
    return key.toUpperCase();
  }
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export const getButtonDisplayName = ({
  key,
  keyName,
}: {
  key: string;
  keyName: string;
}): string => {
  if (!isUsefulKeyToken(key)) {
    return keyName || key;
  }
  const englishLabel = toKeyLabel(key);
  if (!keyName || keyName === key || keyName.toLowerCase() === key.toLowerCase()) {
    return englishLabel;
  }
  if (CJK_PATTERN.test(keyName)) {
    return `${englishLabel} (${keyName})`;
  }
  return keyName;
};
