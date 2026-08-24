import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrainerSample } from '../../types.js';
import {
  climateStateToTrainerFrameValues,
  isTrainerBackedDevice,
  listTrainerClimatePackets,
  listTrainerPowerSavingPackets,
  trainerPowerSavingOptionIdFromHa,
} from '../trainerClimate.js';
import { generateTrainerGrid } from '../trainerGenerate.js';
import { inferTrainerFields } from '../trainerInfer.js';
import { TRAINER_DEVICE_REMOTE_ID, createDefaultAcTrainerSchema } from '../trainerPlan.js';

const sample = ({
  id,
  receivedAt,
  paramValues,
  bits,
  unlockedParamId,
}: {
  id: string;
  receivedAt: string;
  paramValues: Record<string, string>;
  bits: string;
  unlockedParamId: string;
}): TrainerSample => ({
  id,
  receivedAt,
  source: 'text',
  paramValues,
  unlockedParamId,
  bits,
  code: 'hidden',
  kind: 'cloud_hex',
  pulseCount: 8,
});

const trainedFile = () => {
  const schema = createDefaultAcTrainerSchema();
  const samples = [
    sample({
      id: '24',
      receivedAt: '2026-01-01T00:00:01.000Z',
      unlockedParamId: 'temp',
      paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: 'off' },
      bits: '1000100000001000100100100011',
    }),
    sample({
      id: '16',
      receivedAt: '2026-01-01T00:00:00.000Z',
      unlockedParamId: 'temp',
      paramValues: { mode: 'cool', temp: '16', speed: 'medium', powerSaving: 'off' },
      bits: '1000100000001000000100101011',
    }),
    sample({
      id: '30',
      receivedAt: '2026-01-01T00:00:01.500Z',
      unlockedParamId: 'temp',
      paramValues: { mode: 'cool', temp: '30', speed: 'medium', powerSaving: 'off' },
      bits: '1000100000001000111100101001',
    }),
    sample({
      id: 'low',
      receivedAt: '2026-01-01T00:00:02.000Z',
      unlockedParamId: 'speed',
      paramValues: { mode: 'cool', temp: '24', speed: 'low', powerSaving: 'off' },
      bits: '1000100000001000100100000001',
    }),
    sample({
      id: 'high',
      receivedAt: '2026-01-01T00:00:02.500Z',
      unlockedParamId: 'speed',
      paramValues: { mode: 'cool', temp: '24', speed: 'high', powerSaving: 'off' },
      bits: '1000100000001000100101000101',
    }),
    sample({
      id: 'dry',
      receivedAt: '2026-01-01T00:00:03.000Z',
      unlockedParamId: 'mode',
      paramValues: { mode: 'dry', temp: '24', powerSaving: 'off' },
      bits: '1000100000001001100100000010',
    }),
    sample({
      id: 'fan',
      receivedAt: '2026-01-01T00:00:03.500Z',
      unlockedParamId: 'mode',
      paramValues: { mode: 'fan_only', speed: 'medium' },
      bits: '1000100000001010100100100101',
    }),
    sample({
      id: 'ps40',
      receivedAt: '2026-01-01T00:00:04.000Z',
      unlockedParamId: 'powerSaving',
      paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: '40' },
      bits: '1000100011000000100000000100',
    }),
  ];
  const inference = inferTrainerFields({ schema, samples });
  return {
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema,
    samples,
    inference,
    generation: generateTrainerGrid({ schema, samples, inference }),
  };
};

describe('isTrainerBackedDevice', () => {
  it('matches irSource or the trainer remote id', () => {
    assert.equal(isTrainerBackedDevice({ irSource: 'trainer', tuyaRemoteId: 'anything' }), true);
    assert.equal(
      isTrainerBackedDevice({ irSource: 'catalog', tuyaRemoteId: TRAINER_DEVICE_REMOTE_ID }),
      true,
    );
    assert.equal(isTrainerBackedDevice({ irSource: 'catalog', tuyaRemoteId: 'bedroom_ac' }), false);
  });
});

describe('climateStateToTrainerFrameValues', () => {
  it('drops speed on dry and temp on fan_only', () => {
    assert.deepEqual(
      climateStateToTrainerFrameValues({
        isOn: true,
        mode: 'cool',
        temperatureC: 26,
        fanMode: 'high',
      }),
      { mode: 'cool', temp: '26', speed: 'high' },
    );
    assert.deepEqual(
      climateStateToTrainerFrameValues({
        isOn: true,
        mode: 'dry',
        temperatureC: 24,
        fanMode: 'high',
      }),
      { mode: 'dry', temp: '24' },
    );
    assert.deepEqual(
      climateStateToTrainerFrameValues({
        isOn: true,
        mode: 'fan_only',
        temperatureC: 24,
        fanMode: 'medium',
      }),
      { mode: 'fan_only', speed: 'medium' },
    );
  });
});

describe('listTrainerClimatePackets', () => {
  it('sends a generated cool frame and captured dry/fan frames', () => {
    const trainer = trainedFile();
    const alreadyOn = { isOn: true, mode: 'cool', temperatureC: 24, fanMode: 'medium' };
    assert.equal(
      listTrainerClimatePackets({
        trainer,
        previousState: alreadyOn,
        nextState: { isOn: true, mode: 'cool', temperatureC: 18, fanMode: 'medium' },
      })[0]?.bits,
      '1000100000001000001100101101',
    );
    assert.equal(
      listTrainerClimatePackets({
        trainer,
        previousState: alreadyOn,
        nextState: { isOn: true, mode: 'dry', temperatureC: 24, fanMode: 'low' },
      })[0]?.bits,
      '1000100000001001100100000010',
    );
    assert.equal(
      listTrainerClimatePackets({
        trainer,
        previousState: alreadyOn,
        nextState: { isOn: true, mode: 'fan_only', temperatureC: 24, fanMode: 'medium' },
      })[0]?.bits,
      '1000100000001010100100100101',
    );
  });

  it('sends Power On then the climate frame when turning on', () => {
    const trainer = trainedFile();
    trainer.samples = [
      ...trainer.samples,
      {
        id: 'power-on',
        receivedAt: '2026-01-01T00:00:05.000Z',
        source: 'text',
        unlockedParamId: 'power',
        paramValues: { mode: 'cool', temp: '24', speed: 'medium', power: 'on' },
        bits: '1000100000000000101100101101',
        code: 'hidden',
        kind: 'cloud_hex',
        pulseCount: 8,
      },
    ];
    trainer.inference = inferTrainerFields(trainer);
    trainer.generation = generateTrainerGrid(trainer);
    const packetsAt24 = listTrainerClimatePackets({
      trainer,
      previousState: { isOn: false, mode: 'cool', temperatureC: 24, fanMode: 'medium' },
      nextState: { isOn: true, mode: 'cool', temperatureC: 24, fanMode: 'medium' },
    });
    assert.deepEqual(
      packetsAt24.map((packet) => packet.bits),
      ['1000100000000000100100101011', '1000100000001000100100100011'],
    );
    const packetsAt18 = listTrainerClimatePackets({
      trainer,
      previousState: { isOn: false, mode: 'cool', temperatureC: 18, fanMode: 'medium' },
      nextState: { isOn: true, mode: 'cool', temperatureC: 18, fanMode: 'medium' },
    });
    assert.equal(packetsAt18[0]?.bits, '1000100000000000001100100101');
    assert.equal(packetsAt18[0]?.bits === '1000100000000000101100101101', false);
  });

  it('requires a captured Power On command when turning on', () => {
    assert.throws(
      () =>
        listTrainerClimatePackets({
          trainer: trainedFile(),
          previousState: { isOn: false, mode: 'cool', temperatureC: 24, fanMode: 'medium' },
          nextState: { isOn: true, mode: 'cool', temperatureC: 24, fanMode: 'medium' },
        }),
      /Power On/,
    );
  });

  it('requires a captured Power Off command', () => {
    assert.throws(
      () =>
        listTrainerClimatePackets({
          trainer: trainedFile(),
          nextState: { isOn: false, mode: 'cool', temperatureC: 24, fanMode: 'medium' },
        }),
      /Power Off/,
    );
  });

  it('sends a captured power saving command from HA option labels', () => {
    assert.equal(trainerPowerSavingOptionIdFromHa('40%'), '40');
    assert.equal(trainerPowerSavingOptionIdFromHa('Off'), 'off');
    assert.equal(
      listTrainerPowerSavingPackets({ trainer: trainedFile(), optionId: '40' })[0]?.bits,
      '1000100011000000100000000100',
    );
    assert.throws(
      () => listTrainerPowerSavingPackets({ trainer: trainedFile(), optionId: 'off' }),
      /Power saving off/,
    );
  });
});
