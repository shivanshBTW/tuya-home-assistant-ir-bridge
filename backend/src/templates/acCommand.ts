import type { Catalog, CatalogButton, ClimateAssumedState } from '../types.js';

export const AC_MIN_TEMPERATURE_C = 16;
export const AC_MAX_TEMPERATURE_C = 30;
export const AC_DEFAULT_TEMPERATURE_C = 24;
export const AC_DEFAULT_FAN_MODE = 'low' as const;

export const AC_HVAC_MODES = ['cool', 'dry', 'fan_only'] as const;
export const AC_FAN_MODES = ['low', 'medium', 'high'] as const;

export type AcHvacMode = (typeof AC_HVAC_MODES)[number];
export type AcFanMode = (typeof AC_FAN_MODES)[number];

const FAN_SPEED_NUMBER_BY_MODE: Record<AcFanMode, 1 | 2 | 3> = {
  low: 1,
  medium: 2,
  high: 3,
};

const POWER_ON_KEYS = ['power_on', 'PowerOn'] as const;
const POWER_OFF_KEYS = ['power_off', 'PowerOff'] as const;

const LEARNED_MODE_LABELS: Record<AcHvacMode, readonly string[]> = {
  cool: ['cold', 'cool'],
  dry: ['dehumidify', 'dry'],
  fan_only: ['fan only mode', 'fan only'],
};

const LEARNED_FAN_LABELS: Record<AcFanMode, readonly string[]> = {
  low: ['fan 1', 'fan1'],
  medium: ['fan 2', 'fan2'],
  high: ['fan 3', 'fan3'],
};

const TEMPERATURE_UP_LABELS = ['t', 'temperature', 'temp up', 'temp+'] as const;

const normalizeButtonLabel = (value: string): string => {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
};

export const clampAcTemperatureC = (temperatureC: number): number => {
  if (!Number.isFinite(temperatureC)) {
    return AC_DEFAULT_TEMPERATURE_C;
  }
  return Math.min(AC_MAX_TEMPERATURE_C, Math.max(AC_MIN_TEMPERATURE_C, Math.round(temperatureC)));
};

export const normalizeAcHvacMode = (mode: string | undefined): AcHvacMode => {
  if (mode === 'dry' || mode === 'fan_only') {
    return mode;
  }
  return 'cool';
};

export const normalizeAcFanMode = (fanMode: string | undefined): AcFanMode => {
  if (fanMode === 'medium' || fanMode === 'high') {
    return fanMode;
  }
  return AC_DEFAULT_FAN_MODE;
};

export const isAcHvacMode = (mode: string): mode is AcHvacMode => {
  return AC_HVAC_MODES.includes(mode as AcHvacMode);
};

export const resolveAcLibraryKey = ({
  mode,
  temperatureC,
  fanMode,
}: {
  mode: AcHvacMode;
  temperatureC: number;
  fanMode: AcFanMode;
}): string => {
  if (mode === 'dry') {
    return 'M4_S1';
  }
  const speedNumber = FAN_SPEED_NUMBER_BY_MODE[fanMode];
  const resolvedTemperatureC = clampAcTemperatureC(temperatureC);
  if (mode === 'fan_only') {
    return `M3_T${resolvedTemperatureC}_S${speedNumber}`;
  }
  return `M0_T${resolvedTemperatureC}_S${speedNumber}`;
};

export const findRemoteButtonByKeys = ({
  catalog,
  remoteId,
  keys,
}: {
  catalog: Catalog;
  remoteId: string;
  keys: readonly string[];
}): CatalogButton => {
  const preferredRemote = catalog.remotes.find((item) => item.remoteId === remoteId);
  const remotesToSearch = preferredRemote
    ? [preferredRemote, ...catalog.remotes.filter((item) => item.remoteId !== remoteId)]
    : catalog.remotes;
  if (remotesToSearch.length === 0) {
    throw new Error(`Unknown Tuya remote ${remoteId}`);
  }
  for (const remote of remotesToSearch) {
    for (const key of keys) {
      const button = remote.buttons.find((item) => item.key === key);
      if (button) {
        return button;
      }
    }
  }
  throw new Error(`Remote ${remoteId} has no key among ${keys.join(', ')}`);
};

export const findAcPowerButton = ({
  catalog,
  remoteId,
  isOn,
}: {
  catalog: Catalog;
  remoteId: string;
  isOn: boolean;
}): CatalogButton => {
  return findRemoteButtonByKeys({
    catalog,
    remoteId,
    keys: isOn ? POWER_ON_KEYS : POWER_OFF_KEYS,
  });
};

export const findAcLibraryButton = ({
  catalog,
  remoteId,
  state,
}: {
  catalog: Catalog;
  remoteId: string;
  state: ClimateAssumedState;
}): CatalogButton => {
  const mode = normalizeAcHvacMode(state.mode);
  const key = resolveAcLibraryKey({
    mode,
    temperatureC: state.temperatureC ?? AC_DEFAULT_TEMPERATURE_C,
    fanMode: mode === 'dry' ? AC_DEFAULT_FAN_MODE : normalizeAcFanMode(state.fanMode),
  });
  return findRemoteButtonByKeys({ catalog, remoteId, keys: [key] });
};

export const findCatalogButtonByLabels = ({
  catalog,
  remoteId,
  labels,
}: {
  catalog: Catalog;
  remoteId: string;
  labels: readonly string[];
}): CatalogButton | undefined => {
  const wantedLabels = new Set(labels.map(normalizeButtonLabel));
  const preferredRemote = catalog.remotes.find((item) => item.remoteId === remoteId);
  const remotesToSearch = preferredRemote
    ? [preferredRemote, ...catalog.remotes.filter((item) => item.remoteId !== remoteId)]
    : catalog.remotes;

  const pickFromRemote = (remote: Catalog['remotes'][number]): CatalogButton | undefined => {
    const matches = remote.buttons.filter((button) => {
      return (
        wantedLabels.has(normalizeButtonLabel(button.key)) ||
        wantedLabels.has(normalizeButtonLabel(button.keyName))
      );
    });
    return matches.find((button) => button.source === 'learned') ?? matches[0];
  };

  for (const remote of remotesToSearch) {
    const button = pickFromRemote(remote);
    if (button) {
      return button;
    }
  }
  return undefined;
};

export const countAcTemperatureUpSteps = ({
  fromC,
  toC,
}: {
  fromC: number;
  toC: number;
}): number => {
  const fromTemperatureC = clampAcTemperatureC(fromC);
  const toTemperatureC = clampAcTemperatureC(toC);
  if (fromTemperatureC === toTemperatureC) {
    return 0;
  }
  if (toTemperatureC > fromTemperatureC) {
    return toTemperatureC - fromTemperatureC;
  }
  return AC_MAX_TEMPERATURE_C - fromTemperatureC + (toTemperatureC - AC_MIN_TEMPERATURE_C) + 1;
};

export const listAcClimateButtonsToSend = ({
  catalog,
  remoteId,
  previousState,
  nextState,
}: {
  catalog: Catalog;
  remoteId: string;
  previousState: ClimateAssumedState;
  nextState: ClimateAssumedState;
}): CatalogButton[] => {
  if (!nextState.isOn) {
    return [findAcPowerButton({ catalog, remoteId, isOn: false })];
  }

  const buttons: CatalogButton[] = [];
  if (!previousState.isOn) {
    buttons.push(findAcPowerButton({ catalog, remoteId, isOn: true }));
  }

  const nextMode = normalizeAcHvacMode(nextState.mode);
  const previousMode = normalizeAcHvacMode(previousState.mode);
  const nextFanMode = normalizeAcFanMode(nextState.fanMode);
  const previousFanMode = normalizeAcFanMode(previousState.fanMode);
  const nextTemperatureC = clampAcTemperatureC(nextState.temperatureC ?? AC_DEFAULT_TEMPERATURE_C);
  const previousTemperatureC = clampAcTemperatureC(
    previousState.temperatureC ?? AC_DEFAULT_TEMPERATURE_C,
  );
  const learnedMode = findCatalogButtonByLabels({
    catalog,
    remoteId,
    labels: LEARNED_MODE_LABELS[nextMode],
  });
  const learnedFan =
    nextMode === 'dry'
      ? undefined
      : findCatalogButtonByLabels({
          catalog,
          remoteId,
          labels: LEARNED_FAN_LABELS[nextFanMode],
        });
  const temperatureUp = findCatalogButtonByLabels({
    catalog,
    remoteId,
    labels: TEMPERATURE_UP_LABELS,
  });

  if (!learnedMode && !learnedFan) {
    buttons.push(findAcLibraryButton({ catalog, remoteId, state: nextState }));
    return buttons;
  }

  const isTurningOn = !previousState.isOn;
  if ((isTurningOn || previousMode !== nextMode) && learnedMode) {
    buttons.push(learnedMode);
  }
  if ((isTurningOn || previousFanMode !== nextFanMode) && learnedFan) {
    buttons.push(learnedFan);
  }
  if (nextMode === 'cool' && temperatureUp) {
    const stepCount = countAcTemperatureUpSteps({
      fromC: previousTemperatureC,
      toC: nextTemperatureC,
    });
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      buttons.push(temperatureUp);
    }
  }

  return buttons;
};

export const applyAcPowerCommand = ({
  state,
  isOn,
}: {
  state: ClimateAssumedState;
  isOn: boolean;
}): ClimateAssumedState => {
  return {
    ...state,
    isOn,
    mode: normalizeAcHvacMode(state.mode),
    temperatureC: clampAcTemperatureC(state.temperatureC ?? AC_DEFAULT_TEMPERATURE_C),
    fanMode: normalizeAcFanMode(state.fanMode),
  };
};

export const applyAcModeCommand = ({
  state,
  mode,
}: {
  state: ClimateAssumedState;
  mode: string;
}): ClimateAssumedState | undefined => {
  if (!isAcHvacMode(mode)) {
    return undefined;
  }
  return {
    ...state,
    isOn: true,
    mode,
    temperatureC: clampAcTemperatureC(state.temperatureC ?? AC_DEFAULT_TEMPERATURE_C),
    fanMode: normalizeAcFanMode(state.fanMode),
  };
};

export const applyAcTemperatureCommand = ({
  state,
  temperatureC,
}: {
  state: ClimateAssumedState;
  temperatureC: number;
}): ClimateAssumedState | undefined => {
  if (normalizeAcHvacMode(state.mode) !== 'cool') {
    return undefined;
  }
  return {
    ...state,
    isOn: true,
    mode: 'cool',
    temperatureC: clampAcTemperatureC(temperatureC),
    fanMode: normalizeAcFanMode(state.fanMode),
  };
};

export const applyAcFanModeCommand = ({
  state,
  fanMode,
}: {
  state: ClimateAssumedState;
  fanMode: string;
}): ClimateAssumedState | undefined => {
  if (normalizeAcHvacMode(state.mode) === 'dry') {
    return undefined;
  }
  return {
    ...state,
    isOn: true,
    mode: normalizeAcHvacMode(state.mode),
    temperatureC: clampAcTemperatureC(state.temperatureC ?? AC_DEFAULT_TEMPERATURE_C),
    fanMode: normalizeAcFanMode(fanMode),
  };
};

export const publishedAcFanMode = (state: ClimateAssumedState): AcFanMode => {
  if (normalizeAcHvacMode(state.mode) === 'dry') {
    return AC_DEFAULT_FAN_MODE;
  }
  return normalizeAcFanMode(state.fanMode);
};
