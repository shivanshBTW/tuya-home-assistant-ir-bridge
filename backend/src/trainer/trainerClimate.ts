import type { ClimateAssumedState, DeviceMapping, TrainerFile, TrainerGeneratedCell } from '../types.js';
import {
  AC_DEFAULT_TEMPERATURE_C,
  clampAcTemperatureC,
  normalizeAcFanMode,
  normalizeAcHvacMode,
} from '../templates/acCommand.js';
import { generateTrainerGrid } from './trainerGenerate.js';
import { inferTrainerFields } from './trainerInfer.js';
import {
  TRAINER_DEVICE_REMOTE_ID,
  TRAINER_PARAM_POWER,
  TRAINER_PARAM_POWER_SAVING,
} from './trainerPlan.js';

export const TRAINER_POWER_SAVING_HA_OPTIONS = ['40%', '60%', '80%', 'Off'] as const;

const TRAINER_POWER_SAVING_HA_OPTION_BY_ID: Record<string, string> = {
  '40': '40%',
  '60': '60%',
  '80': '80%',
  off: 'Off',
};

export const isTrainerBackedDevice = (
  device: Pick<DeviceMapping, 'irSource' | 'tuyaRemoteId'>,
): boolean => {
  return device.irSource === 'trainer' || device.tuyaRemoteId === TRAINER_DEVICE_REMOTE_ID;
};

export const climateStateToTrainerFrameValues = (
  state: ClimateAssumedState,
): Record<string, string> => {
  const mode = normalizeAcHvacMode(state.mode);
  const temp = String(clampAcTemperatureC(state.temperatureC ?? AC_DEFAULT_TEMPERATURE_C));
  const speed = normalizeAcFanMode(state.fanMode);
  if (mode === 'dry') {
    return { mode, temp };
  }
  if (mode === 'fan_only') {
    return { mode, speed };
  }
  return { mode, temp, speed };
};

export const trainerPowerSavingOptionIdFromHa = (payload: string): string | undefined => {
  const trimmed = payload.trim();
  if (trimmed === 'Off' || trimmed === 'off') {
    return 'off';
  }
  const match = /^(\d+)%?$/.exec(trimmed);
  return match?.[1];
};

export const trainerPowerSavingHaLabel = (optionId: string | undefined): string | undefined => {
  if (!optionId) {
    return undefined;
  }
  const mappedLabel = TRAINER_POWER_SAVING_HA_OPTION_BY_ID[optionId];
  if (mappedLabel) {
    return mappedLabel;
  }
  const normalizedOptionId = trainerPowerSavingOptionIdFromHa(optionId);
  return normalizedOptionId ? TRAINER_POWER_SAVING_HA_OPTION_BY_ID[normalizedOptionId] : undefined;
};

const isSameParamValues = (
  left: Record<string, string>,
  right: Record<string, string>,
): boolean => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
};

const trainerGeneration = (trainer: TrainerFile) => {
  const inference = trainer.inference ?? inferTrainerFields(trainer);
  return generateTrainerGrid({ ...trainer, inference });
};

export const findTrainerCommandCell = ({
  trainer,
  paramId,
  optionId,
}: {
  trainer: TrainerFile;
  paramId: string;
  optionId: string;
}): TrainerGeneratedCell | undefined => {
  return trainerGeneration(trainer).cells.find(
    (cell) => cell.kind === 'command' && cell.paramValues[paramId] === optionId,
  );
};

export const listTrainerClimatePackets = ({
  trainer,
  nextState,
}: {
  trainer: TrainerFile;
  nextState: ClimateAssumedState;
}): { bits: string; label: string }[] => {
  const generation = trainerGeneration(trainer);
  if (!nextState.isOn) {
    const offCell = generation.cells.find(
      (cell) => cell.kind === 'command' && cell.paramValues[TRAINER_PARAM_POWER] === 'off',
    );
    if (!offCell?.bits) {
      throw new Error(
        'Capture Train Power Off before Home Assistant or Google can turn the AC off',
      );
    }
    return [{ bits: offCell.bits, label: offCell.label }];
  }
  const paramValues = climateStateToTrainerFrameValues(nextState);
  const cell = generation.cells.find(
    (frameCell) =>
      frameCell.kind === 'frame' && isSameParamValues(frameCell.paramValues, paramValues),
  );
  if (!cell?.bits) {
    throw new Error(
      `No trained climate frame for ${Object.entries(paramValues)
        .map(([paramId, optionId]) => `${paramId}=${optionId}`)
        .join(' ')}`,
    );
  }
  return [{ bits: cell.bits, label: cell.label }];
};

export const listTrainerPowerSavingPackets = ({
  trainer,
  optionId,
}: {
  trainer: TrainerFile;
  optionId: string;
}): { bits: string; label: string }[] => {
  const cell = findTrainerCommandCell({
    trainer,
    paramId: TRAINER_PARAM_POWER_SAVING,
    optionId,
  });
  if (!cell?.bits) {
    throw new Error(`Capture Train Power saving ${optionId} before sending it`);
  }
  return [{ bits: cell.bits, label: cell.label }];
};
