import type {
  ClimateAssumedState,
  DeviceMapping,
  TrainerFile,
  TrainerGeneratedCell,
} from '../types.js';
import {
  AC_DEFAULT_TEMPERATURE_C,
  clampAcTemperatureC,
  normalizeAcFanMode,
  normalizeAcHvacMode,
} from '../templates/acCommand.js';
import { generateTrainerGrid, overlayGeneratedBits } from './trainerGenerate.js';
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

const trainerRuntime = (trainer: TrainerFile) => {
  const inference = inferTrainerFields(trainer);
  const generation = generateTrainerGrid({ ...trainer, inference });
  return { inference, generation };
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
  return trainerRuntime(trainer).generation.cells.find(
    (cell) => cell.kind === 'command' && cell.paramValues[paramId] === optionId,
  );
};

const findTrainerPowerCell = ({
  generation,
  optionId,
}: {
  generation: ReturnType<typeof trainerRuntime>['generation'];
  optionId: 'on' | 'off';
}) => {
  return generation.cells.find(
    (cell) => cell.kind === 'command' && cell.paramValues[TRAINER_PARAM_POWER] === optionId,
  );
};

export const listTrainerClimatePackets = ({
  trainer,
  previousState,
  nextState,
}: {
  trainer: TrainerFile;
  previousState?: ClimateAssumedState;
  nextState: ClimateAssumedState;
}): { bits: string; label: string }[] => {
  const { inference, generation } = trainerRuntime(trainer);
  if (!nextState.isOn) {
    const offCell = findTrainerPowerCell({ generation, optionId: 'off' });
    if (!offCell?.bits) {
      throw new Error(
        'Capture Train Power Off before Home Assistant or Google can turn the AC off',
      );
    }
    return [{ bits: offCell.bits, label: offCell.label }];
  }
  const paramValues = climateStateToTrainerFrameValues(nextState);
  const packets: { bits: string; label: string }[] = [];
  const onCell = findTrainerPowerCell({ generation, optionId: 'on' });
  const isTurningOn = !previousState?.isOn;
  if (isTurningOn) {
    if (!onCell?.bits) {
      throw new Error('Capture Train Power On before Home Assistant or Google can turn the AC on');
    }
    const overlaidOn = overlayGeneratedBits({
      schema: trainer.schema,
      inference,
      paramValues,
      templateBits: onCell.bits,
      checksumKind: generation.checksumKind,
    });
    if (!overlaidOn.bits) {
      throw new Error(
        overlaidOn.needsInputReason ??
          'Could not write the last climate state onto the Power On packet',
      );
    }
    packets.push({ bits: overlaidOn.bits, label: onCell.label });
  }
  const cell = generation.cells.find(
    (frameCell) =>
      frameCell.kind === 'frame' && isSameParamValues(frameCell.paramValues, paramValues),
  );
  if (!cell?.bits) {
    if (packets.length > 0) {
      return packets;
    }
    throw new Error(
      `No trained climate frame for ${Object.entries(paramValues)
        .map(([paramId, optionId]) => `${paramId}=${optionId}`)
        .join(' ')}`,
    );
  }
  packets.push({ bits: cell.bits, label: cell.label });
  return packets;
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
