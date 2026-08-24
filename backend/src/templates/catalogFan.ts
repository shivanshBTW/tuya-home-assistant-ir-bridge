import type { Catalog, CatalogButton, DeviceMapping } from '../types.js';

const SPEED_KEY_PATTERN = /^fan_speed(\d+)$/i;

const normalizeToken = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
};

const hasSendableCode = (button: CatalogButton): boolean => {
  return Boolean(button.code);
};

export const isDirectCatalogFan = (device: DeviceMapping): boolean => {
  return device.template === 'fan' && !device.slots.power;
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
    const speed = speedNumberFromButton(button);
    if (speed === undefined) {
      continue;
    }
    speedButtonByNumber.set(speed, button);
  }
  return [...speedButtonByNumber.entries()]
    .sort(([left], [right]) => left - right)
    .map(([speed, button]) => ({ speed, button }));
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
  const requestedSpeed = Math.max(1, Math.round(speed));
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
