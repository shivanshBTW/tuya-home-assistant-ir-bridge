import type { Catalog, CatalogButton, DeviceMapping } from '../types.js';
import { FAN_SPEED_COUNT } from './deviceTemplates.js';

const SPEED_KEY_PATTERN = /^fan_speed(\d+)$/i;
const MAX_SPEED_TOKENS = new Set(['boost', 'max', 'maxspeed', '100', '100percent']);

const normalizeToken = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const hasSendableCode = (button: CatalogButton): boolean => {
  return Boolean(button.code);
};

export const isCatalogFanMaxSpeedAlias = (button: CatalogButton): boolean => {
  return (
    MAX_SPEED_TOKENS.has(normalizeToken(button.key)) ||
    MAX_SPEED_TOKENS.has(normalizeToken(button.keyName))
  );
};

export const normalizeRequestedFanSpeed = ({
  speed,
  speedCeiling,
}: {
  speed: number;
  speedCeiling: number;
}): number => {
  const ceiling = Math.max(1, speedCeiling);
  if (!Number.isFinite(speed)) {
    return 1;
  }
  const requestedSpeed = Math.round(speed);
  if (requestedSpeed >= 100) {
    return ceiling;
  }
  return Math.min(ceiling, Math.max(1, requestedSpeed));
};

export const catalogFanButtonSlug = (button: CatalogButton): string => {
  if (button.source === 'learned') {
    return button.keyName
      .trim()
      .toLowerCase()
      .replace(/\+/g, 'plus')
      .replace(/[−–-]/g, 'minus')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  return button.key.toLowerCase();
};

export const listCatalogRemoteButtons = ({
  catalog,
  remoteId,
}: {
  catalog: Catalog;
  remoteId: string;
}): CatalogButton[] => {
  const remote = catalog.remotes.find((item) => item.remoteId === remoteId);
  return remote?.buttons.filter(hasSendableCode) ?? [];
};

const speedNumberFromButton = (button: CatalogButton): number | undefined => {
  const keyMatch = SPEED_KEY_PATTERN.exec(button.key);
  if (keyMatch?.[1]) {
    return Number(keyMatch[1]);
  }
  const nameMatch = SPEED_KEY_PATTERN.exec(normalizeToken(button.keyName));
  if (nameMatch?.[1]) {
    return Number(nameMatch[1]);
  }
  if (isCatalogFanMaxSpeedAlias(button)) {
    return FAN_SPEED_COUNT;
  }
  return undefined;
};

export const listCatalogFanSpeedButtons = ({
  catalog,
  remoteId,
}: {
  catalog: Catalog;
  remoteId: string;
}): { speed: number; button: CatalogButton }[] => {
  const speedButtonByNumber = new Map<number, CatalogButton>();
  for (const button of listCatalogRemoteButtons({ catalog, remoteId })) {
    const numberedMatch = SPEED_KEY_PATTERN.exec(button.key);
    const numberedSpeed = numberedMatch?.[1] ? Number(numberedMatch[1]) : undefined;
    if (numberedSpeed !== undefined) {
      speedButtonByNumber.set(numberedSpeed, button);
      continue;
    }
    const speed = speedNumberFromButton(button);
    if (speed === undefined || speedButtonByNumber.has(speed)) {
      continue;
    }
    speedButtonByNumber.set(speed, button);
  }
  return [...speedButtonByNumber.entries()]
    .sort(([left], [right]) => left - right)
    .map(([speed, button]) => ({ speed, button }));
};

export const catalogFanSpeedRangeMax = ({
  catalog,
  remoteId,
}: {
  catalog: Catalog;
  remoteId: string;
}): number => {
  const speeds = listCatalogFanSpeedButtons({ catalog, remoteId }).map((item) => item.speed);
  if (speeds.length === 0) {
    return FAN_SPEED_COUNT;
  }
  return Math.max(...speeds);
};

export const findCatalogFanPowerButton = ({
  catalog,
  remoteId,
}: {
  catalog: Catalog;
  remoteId: string;
}): CatalogButton => {
  const buttons = listCatalogRemoteButtons({ catalog, remoteId });
  const powerButton = buttons.find((button) => normalizeToken(button.key) === 'power');
  if (!powerButton) {
    throw new Error(`Catalog remote ${remoteId} has no power key`);
  }
  return powerButton;
};

export const resolveCatalogFanSpeedButton = ({
  catalog,
  remoteId,
  speed,
}: {
  catalog: Catalog;
  remoteId: string;
  speed: number;
}): CatalogButton => {
  const speedButtons = listCatalogFanSpeedButtons({ catalog, remoteId });
  if (speedButtons.length === 0) {
    throw new Error(`Catalog remote ${remoteId} has no fan_speed keys`);
  }
  const speedCeiling = catalogFanSpeedRangeMax({ catalog, remoteId });
  const requestedSpeed = normalizeRequestedFanSpeed({ speed, speedCeiling });
  const exact = speedButtons.find((item) => item.speed === requestedSpeed);
  if (exact) {
    return exact.button;
  }
  const fallback = [...speedButtons].reverse().find((item) => item.speed <= requestedSpeed);
  if (!fallback) {
    return speedButtons[0]?.button as CatalogButton;
  }
  return fallback.button;
};

export const listCatalogFanExtraButtons = ({
  catalog,
  remoteId,
}: {
  catalog: Catalog;
  remoteId: string;
}): CatalogButton[] => {
  return listCatalogRemoteButtons({ catalog, remoteId }).filter((button) => {
    if (normalizeToken(button.key) === 'power') {
      return false;
    }
    return speedNumberFromButton(button) === undefined;
  });
};

export const findCatalogFanExtraButton = ({
  catalog,
  remoteId,
  slug,
}: {
  catalog: Catalog;
  remoteId: string;
  slug: string;
}): CatalogButton => {
  const button = listCatalogFanExtraButtons({ catalog, remoteId }).find(
    (item) => catalogFanButtonSlug(item) === slug,
  );
  if (!button) {
    throw new Error(`Catalog remote ${remoteId} has no extra key ${slug}`);
  }
  return button;
};

export const resolveFanPowerButtonToSend = ({
  catalog,
  device,
}: {
  catalog: Catalog;
  device: DeviceMapping;
}): { buttonId: string; label: string } => {
  const mappedPower = device.slots.power;
  if (mappedPower) {
    return { buttonId: mappedPower.buttonId, label: 'power' };
  }
  const powerButton = findCatalogFanPowerButton({
    catalog,
    remoteId: device.tuyaRemoteId,
  });
  return { buttonId: powerButton.id, label: powerButton.key };
};

export const findMappedFanSpeedSlotId = ({
  slots,
  speed,
}: {
  slots: DeviceMapping['slots'];
  speed: number;
}): string | undefined => {
  if (speed >= FAN_SPEED_COUNT) {
    if (slots.speed_6) {
      return 'speed_6';
    }
    if (slots.max) {
      return 'max';
    }
    return undefined;
  }
  const slotId = `speed_${speed}`;
  if (slots[slotId]) {
    return slotId;
  }
  return undefined;
};

export const resolveFanSpeedButtonToSend = ({
  catalog,
  device,
  speed,
}: {
  catalog: Catalog;
  device: DeviceMapping;
  speed: number;
}): { buttonId: string; label: string } => {
  const speedCeiling = catalogFanSpeedRangeMax({ catalog, remoteId: device.tuyaRemoteId });
  const requestedSpeed = normalizeRequestedFanSpeed({ speed, speedCeiling });
  const mappedSlotId = findMappedFanSpeedSlotId({
    slots: device.slots,
    speed: requestedSpeed,
  });
  if (mappedSlotId) {
    const mappedSlot = device.slots[mappedSlotId];
    if (mappedSlot) {
      return { buttonId: mappedSlot.buttonId, label: mappedSlotId };
    }
  }
  const speedButton = resolveCatalogFanSpeedButton({
    catalog,
    remoteId: device.tuyaRemoteId,
    speed: requestedSpeed,
  });
  return { buttonId: speedButton.id, label: speedButton.key };
};
