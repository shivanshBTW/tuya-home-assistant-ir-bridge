import type { ClimateAssumedState } from '../types.js';
import {
  AC_DEFAULT_TEMPERATURE_C,
  AC_FAN_MODES,
  AC_HVAC_MODES,
  AC_MAX_TEMPERATURE_C,
  AC_MIN_TEMPERATURE_C,
  applyAcFanModeCommand,
  applyAcModeCommand,
  applyAcPowerCommand,
  applyAcTemperatureCommand,
  clampAcTemperatureC,
  normalizeAcFanMode,
  normalizeAcHvacMode,
} from '../templates/acCommand.js';

export const CLIMATE_COMMAND_COALESCE_MS = 150;

export type ClimateMqttCommandKind = 'power' | 'mode' | 'temperature' | 'fan_mode';

export interface ClimateMqttCommand {
  kind: ClimateMqttCommandKind;
  payload: string;
}

export const rememberedAcTemperatureC = (state: ClimateAssumedState): number => {
  return clampAcTemperatureC(state.temperatureC ?? AC_DEFAULT_TEMPERATURE_C);
};

export const climateCommandKindFromTopic = (
  messageTopic: string,
): ClimateMqttCommandKind | undefined => {
  if (messageTopic.endsWith('/climate/power/set')) {
    return 'power';
  }
  if (messageTopic.endsWith('/climate/mode/set')) {
    return 'mode';
  }
  if (messageTopic.endsWith('/climate/temperature/set')) {
    return 'temperature';
  }
  if (messageTopic.endsWith('/climate/fan_mode/set')) {
    return 'fan_mode';
  }
  return undefined;
};

const lastPayload = (
  commands: ClimateMqttCommand[],
  kind: ClimateMqttCommandKind,
): string | undefined => {
  let payload: string | undefined;
  for (const command of commands) {
    if (command.kind === kind) {
      payload = command.payload;
    }
  }
  return payload;
};

const normalizeClimateMqttCommands = (commands: ClimateMqttCommand[]): ClimateMqttCommand[] => {
  return commands.map((command) => {
    if (command.kind === 'mode' && command.payload === 'off') {
      return { kind: 'power', payload: 'OFF' };
    }
    return command;
  });
};

export const applyClimateMqttBurst = ({
  state,
  commands,
  shouldApplyAllFields = false,
}: {
  state: ClimateAssumedState;
  commands: ClimateMqttCommand[];
  shouldApplyAllFields?: boolean;
}): ClimateAssumedState => {
  let nextState: ClimateAssumedState = {
    ...state,
    mode: normalizeAcHvacMode(state.mode),
    temperatureC: rememberedAcTemperatureC(state),
    fanMode: normalizeAcFanMode(state.fanMode),
  };
  const normalizedCommands = normalizeClimateMqttCommands(commands);
  const lastPower = lastPayload(normalizedCommands, 'power');
  const lastMode = lastPayload(normalizedCommands, 'mode');
  const lastTemperature = lastPayload(normalizedCommands, 'temperature');
  const lastFanMode = lastPayload(normalizedCommands, 'fan_mode');
  const hasMode = lastMode !== undefined;
  const hasTemperature = lastTemperature !== undefined;
  const hasFanMode = lastFanMode !== undefined;

  if (lastPower !== undefined) {
    nextState = applyAcPowerCommand({
      state: nextState,
      isOn: lastPower.toUpperCase() === 'ON',
    });
    if (!nextState.isOn && !hasMode && !hasTemperature && !hasFanMode) {
      return nextState;
    }
  }

  if (lastMode !== undefined) {
    const modeState = applyAcModeCommand({ state: nextState, mode: lastMode });
    if (modeState) {
      nextState = modeState;
    }
  }

  if (lastFanMode !== undefined) {
    const fanState = applyAcFanModeCommand({ state: nextState, fanMode: lastFanMode });
    if (fanState) {
      nextState = fanState;
    }
  }

  const shouldApplyTemperature =
    hasTemperature && (shouldApplyAllFields || (!hasFanMode && !hasMode));
  if (shouldApplyTemperature && lastTemperature !== undefined) {
    if (shouldApplyAllFields) {
      nextState = {
        ...nextState,
        isOn: true,
        temperatureC: clampAcTemperatureC(Number(lastTemperature)),
      };
    } else {
      const temperatureState = applyAcTemperatureCommand({
        state: nextState,
        temperatureC: Number(lastTemperature),
      });
      if (temperatureState) {
        nextState = temperatureState;
      }
    }
  }

  return nextState;
};

export const acClimateDiscoveryPayload = ({
  name,
  uniqueId,
  deviceName,
  deviceIdentifier,
  modeCommandTopic,
  modeStateTopic,
  powerCommandTopic,
  powerStateTopic,
  temperatureCommandTopic,
  temperatureStateTopic,
  currentTemperatureTopic,
  fanModeCommandTopic,
  fanModeStateTopic,
}: {
  name: string;
  uniqueId: string;
  deviceName: string;
  deviceIdentifier: string;
  modeCommandTopic: string;
  modeStateTopic: string;
  powerCommandTopic: string;
  powerStateTopic: string;
  temperatureCommandTopic: string;
  temperatureStateTopic: string;
  currentTemperatureTopic: string;
  fanModeCommandTopic: string;
  fanModeStateTopic: string;
}): Record<string, unknown> => {
  return {
    name,
    unique_id: uniqueId,
    mode_command_topic: modeCommandTopic,
    mode_state_topic: modeStateTopic,
    modes: [...AC_HVAC_MODES],
    power_command_topic: powerCommandTopic,
    power_state_topic: powerStateTopic,
    payload_on: 'ON',
    payload_off: 'OFF',
    temperature_command_topic: temperatureCommandTopic,
    temperature_state_topic: temperatureStateTopic,
    current_temperature_topic: currentTemperatureTopic,
    min_temp: AC_MIN_TEMPERATURE_C,
    max_temp: AC_MAX_TEMPERATURE_C,
    temp_step: 1,
    fan_mode_command_topic: fanModeCommandTopic,
    fan_mode_state_topic: fanModeStateTopic,
    fan_modes: [...AC_FAN_MODES],
    device: { identifiers: [deviceIdentifier], name: deviceName },
  };
};
