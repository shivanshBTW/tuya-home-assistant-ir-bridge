import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrainerFile } from '../../types.js';
import { bitsToPulses, pulsesToBits, pulsesToHex } from '../../tuya/irDecode.js';
import { trainerPulsesForSend } from '../trainerIrSend.js';
import { createDefaultAcTrainerSchema } from '../trainerPlan.js';

const capturedBits = '1000100000001000110001001000';
const generatedBits = '1000100000001000001100101101';

const trainerWithCapturedClimate = (): TrainerFile => {
  const syntheticPulses = bitsToPulses(capturedBits);
  const capturedPulses = [
    3308,
    9870,
    ...syntheticPulses.slice(2, -1),
    506,
    syntheticPulses[syntheticPulses.length - 1] ?? 30_000,
  ];
  return {
    updatedAt: '2026-01-01T00:00:00.000Z',
    schema: createDefaultAcTrainerSchema(),
    samples: [
      {
        id: '24',
        receivedAt: '2026-01-01T00:00:00.000Z',
        source: 'text',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '24', speed: 'medium' },
        bits: capturedBits,
        code: pulsesToHex(capturedPulses),
        kind: 'cloud_hex',
        pulseCount: capturedPulses.length,
      },
    ],
  };
};

describe('trainerPulsesForSend', () => {
  it('replays the original captured pulse train when bits match a sample', () => {
    const trainer = trainerWithCapturedClimate();
    const { originalCode, pulses } = trainerPulsesForSend({ bits: capturedBits, trainer });
    assert.equal(originalCode, trainer.samples[0]?.code);
    assert.equal(pulses[0], 3308);
    assert.equal(pulses.at(-2), 506);
    assert.equal(pulsesToBits(pulses), capturedBits);
  });

  it('overlays generated bits onto the captured timings including the trailing mark', () => {
    const trainer = trainerWithCapturedClimate();
    const { originalCode, pulses } = trainerPulsesForSend({ bits: generatedBits, trainer });
    assert.equal(originalCode, undefined);
    assert.equal(pulsesToBits(pulses), generatedBits);
    assert.equal(pulses[0], 3308);
    assert.equal(pulses.at(-2), 506);
    assert.notEqual(pulses.length, bitsToPulses(generatedBits).length);
  });
});
