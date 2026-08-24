import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClimateAssumedState } from '../../types.js';
import { resolveAcLibraryKey } from '../../templates/acCommand.js';
import {
  acClimateDiscoveryPayload,
  applyClimateMqttBurst,
  climateCommandKindFromTopic,
  rememberedAcTemperatureC,
} from '../climateMqtt.js';

const memoryState = (overrides: Partial<ClimateAssumedState> = {}): ClimateAssumedState => ({
  isOn: true,
  mode: 'cool',
  temperatureC: 24,
  fanMode: 'low',
  ...overrides,
});

describe('climate MQTT discovery', () => {
  it('publishes assumed current temperature from app memory', () => {
    const discovery = acClimateDiscoveryPayload({
      name: 'Bedroom AC',
      uniqueId: 'bridge_ac_climate',
      deviceName: 'Bedroom AC',
      deviceIdentifier: 'bridge_ac',
      modeCommandTopic: 'ha/mode/set',
      modeStateTopic: 'ha/mode',
      powerCommandTopic: 'ha/power/set',
      powerStateTopic: 'ha/power',
      temperatureCommandTopic: 'ha/temperature/set',
      temperatureStateTopic: 'ha/temperature',
      currentTemperatureTopic: 'ha/current_temperature',
      fanModeCommandTopic: 'ha/fan_mode/set',
      fanModeStateTopic: 'ha/fan_mode',
    });

    assert.equal(discovery.current_temperature_topic, 'ha/current_temperature');
    assert.equal(discovery.temperature_state_topic, 'ha/temperature');
    assert.deepEqual(discovery.modes, ['off', 'cool', 'dry', 'fan_only']);
    assert.equal(rememberedAcTemperatureC(memoryState({ temperatureC: undefined })), 24);
  });
});

describe('applyClimateMqttBurst', () => {
  it('keeps remembered 24C when Google dumps 26 cool high with a fan change', () => {
    const nextState = applyClimateMqttBurst({
      state: memoryState(),
      commands: [
        { kind: 'fan_mode', payload: 'high' },
        { kind: 'temperature', payload: '26' },
        { kind: 'mode', payload: 'cool' },
      ],
    });

    assert.equal(nextState.temperatureC, 24);
    assert.equal(nextState.fanMode, 'high');
    assert.equal(nextState.mode, 'cool');
    assert.equal(
      resolveAcLibraryKey({
        mode: 'cool',
        temperatureC: nextState.temperatureC ?? 24,
        fanMode: 'high',
      }),
      'M0_T24_S3',
    );
  });

  it('applies a solo temperature command onto memory', () => {
    const nextState = applyClimateMqttBurst({
      state: memoryState(),
      commands: [{ kind: 'temperature', payload: '26' }],
    });

    assert.equal(nextState.temperatureC, 26);
    assert.equal(nextState.fanMode, 'low');
    assert.equal(nextState.mode, 'cool');
  });

  it('applies overlapping fan then temperature as sequential bursts without losing fan', () => {
    const afterFan = applyClimateMqttBurst({
      state: memoryState(),
      commands: [{ kind: 'fan_mode', payload: 'high' }],
    });
    const afterTemp = applyClimateMqttBurst({
      state: afterFan,
      commands: [{ kind: 'temperature', payload: '22' }],
    });

    assert.equal(afterFan.fanMode, 'high');
    assert.equal(afterFan.temperatureC, 24);
    assert.equal(afterTemp.fanMode, 'high');
    assert.equal(afterTemp.temperatureC, 22);
  });

  it('applies Google temp+fan+mode together when shouldApplyAllFields is true', () => {
    const nextState = applyClimateMqttBurst({
      state: memoryState(),
      commands: [
        { kind: 'fan_mode', payload: 'high' },
        { kind: 'temperature', payload: '26' },
        { kind: 'mode', payload: 'cool' },
      ],
      shouldApplyAllFields: true,
    });

    assert.equal(nextState.temperatureC, 26);
    assert.equal(nextState.fanMode, 'high');
    assert.equal(nextState.mode, 'cool');
  });

  it('applies dry temperature when shouldApplyAllFields is true', () => {
    const nextState = applyClimateMqttBurst({
      state: memoryState({ mode: 'dry' }),
      commands: [{ kind: 'temperature', payload: '22' }],
      shouldApplyAllFields: true,
    });

    assert.equal(nextState.mode, 'dry');
    assert.equal(nextState.temperatureC, 22);
  });

  it('turns the unit off from mode off', () => {
    const nextState = applyClimateMqttBurst({
      state: memoryState(),
      commands: [{ kind: 'mode', payload: 'off' }],
    });

    assert.equal(nextState.isOn, false);
    assert.equal(nextState.temperatureC, 24);
  });
});

describe('climateCommandKindFromTopic', () => {
  it('maps climate set topics', () => {
    assert.equal(
      climateCommandKindFromTopic('homeassistant/tuya_ha_ir_bridge/ac/climate/fan_mode/set'),
      'fan_mode',
    );
    assert.equal(
      climateCommandKindFromTopic('homeassistant/tuya_ha_ir_bridge/ac/media/set'),
      undefined,
    );
  });
});
