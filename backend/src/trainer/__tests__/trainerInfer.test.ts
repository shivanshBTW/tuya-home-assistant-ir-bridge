import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrainerSample, TrainerSchema } from '../../types.js';
import { inferTrainerFields } from '../trainerInfer.js';
import { createDefaultAcTrainerSchema } from '../trainerPlan.js';

const PREFIX = '1000100000001000';

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

const encodeFrame = ({ tempBits, speedBits, checksumBits }: { tempBits: string; speedBits: string; checksumBits: string }): string => {
  return `${PREFIX}${tempBits}${speedBits}${checksumBits}`;
};

describe('inferTrainerFields', () => {
  it('finds the temp field and checksum from 26C/27C plus a speed sweep', () => {
    const schema: TrainerSchema = createDefaultAcTrainerSchema();
    const cool27 = encodeFrame({ tempBits: '1100', speedBits: '0100', checksumBits: '1000' });
    const cool26 = encodeFrame({ tempBits: '1011', speedBits: '0100', checksumBits: '0111' });
    const cool25 = encodeFrame({ tempBits: '1010', speedBits: '0100', checksumBits: '0110' });
    const cool27High = encodeFrame({ tempBits: '1100', speedBits: '1000', checksumBits: '0111' });
    const inference = inferTrainerFields({
      schema,
      samples: [
        sample({
          id: '27',
          receivedAt: '2026-01-01T00:00:00.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '27', speed: 'medium', powerSaving: 'off' },
          bits: cool27,
        }),
        sample({
          id: '26',
          receivedAt: '2026-01-01T00:00:01.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '26', speed: 'medium', powerSaving: 'off' },
          bits: cool26,
        }),
        sample({
          id: '25',
          receivedAt: '2026-01-01T00:00:02.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '25', speed: 'medium', powerSaving: 'off' },
          bits: cool25,
        }),
        sample({
          id: '27h',
          receivedAt: '2026-01-01T00:00:03.000Z',
          unlockedParamId: 'speed',
          paramValues: { mode: 'cool', temp: '27', speed: 'high', powerSaving: 'off' },
          bits: cool27High,
        }),
      ],
    });
    const tempField = inference.fields.find((field) => field.paramId === 'temp');
    assert.deepEqual(tempField?.bitIndexes, [17, 18, 19]);
    assert.equal(tempField?.kind, 'linear');
    assert.deepEqual(inference.checksumIndexes, [24, 25, 26, 27]);
    assert.equal(tempField?.lookup['27'], '100');
    assert.equal(tempField?.lookup['26'], '011');
  });

  it('marks a disabled temp slice sticky when it follows the last enabled value', () => {
    const schema = createDefaultAcTrainerSchema();
    const cool24 = encodeFrame({ tempBits: '1001', speedBits: '0100', checksumBits: '0000' });
    const cool28 = encodeFrame({ tempBits: '1101', speedBits: '0100', checksumBits: '0100' });
    const fanAfter24 = encodeFrame({ tempBits: '1001', speedBits: '0100', checksumBits: '0001' });
    const fanAfter28 = encodeFrame({ tempBits: '1101', speedBits: '0100', checksumBits: '0101' });
    const inference = inferTrainerFields({
      schema,
      samples: [
        sample({
          id: 'c24',
          receivedAt: '2026-01-01T00:00:00.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: 'off' },
          bits: cool24,
        }),
        sample({
          id: 'c24h',
          receivedAt: '2026-01-01T00:00:00.500Z',
          unlockedParamId: 'speed',
          paramValues: { mode: 'cool', temp: '24', speed: 'high', powerSaving: 'off' },
          bits: encodeFrame({ tempBits: '1001', speedBits: '1000', checksumBits: '1100' }),
        }),
        sample({
          id: 'p1',
          receivedAt: '2026-01-01T00:00:01.000Z',
          unlockedParamId: 'mode',
          paramValues: { mode: 'fan_only', speed: 'medium' },
          bits: fanAfter24,
        }),
        sample({
          id: 'c28',
          receivedAt: '2026-01-01T00:00:02.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '28', speed: 'medium', powerSaving: 'off' },
          bits: cool28,
        }),
        sample({
          id: 'p2',
          receivedAt: '2026-01-01T00:00:03.000Z',
          unlockedParamId: 'mode',
          paramValues: { mode: 'fan_only', speed: 'medium' },
          bits: fanAfter28,
        }),
      ],
    });
    const stickyNote = inference.disabledNotes.find(
      (note) => note.paramId === 'temp' && note.primaryOptionId === 'fan_only',
    );
    assert.equal(stickyNote?.role, 'sticky');
  });

  it('marks a disabled temp slice constant when both probes keep the same dummy', () => {
    const schema = createDefaultAcTrainerSchema();
    const dummy = '1000';
    const inference = inferTrainerFields({
      schema,
      samples: [
        sample({
          id: 'c24',
          receivedAt: '2026-01-01T00:00:00.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: 'off' },
          bits: encodeFrame({ tempBits: '1001', speedBits: '0100', checksumBits: '0000' }),
        }),
        sample({
          id: 'c24h',
          receivedAt: '2026-01-01T00:00:00.500Z',
          unlockedParamId: 'speed',
          paramValues: { mode: 'cool', temp: '24', speed: 'high', powerSaving: 'off' },
          bits: encodeFrame({ tempBits: '1001', speedBits: '1000', checksumBits: '1100' }),
        }),
        sample({
          id: 'p1',
          receivedAt: '2026-01-01T00:00:01.000Z',
          unlockedParamId: 'mode',
          paramValues: { mode: 'fan_only', speed: 'medium' },
          bits: encodeFrame({ tempBits: dummy, speedBits: '0100', checksumBits: '0001' }),
        }),
        sample({
          id: 'c28',
          receivedAt: '2026-01-01T00:00:02.000Z',
          unlockedParamId: 'temp',
          paramValues: { mode: 'cool', temp: '28', speed: 'medium', powerSaving: 'off' },
          bits: encodeFrame({ tempBits: '1101', speedBits: '0100', checksumBits: '0100' }),
        }),
        sample({
          id: 'p2',
          receivedAt: '2026-01-01T00:00:03.000Z',
          unlockedParamId: 'mode',
          paramValues: { mode: 'fan_only', speed: 'medium' },
          bits: encodeFrame({ tempBits: dummy, speedBits: '0100', checksumBits: '0101' }),
        }),
      ],
    });
    const constantNote = inference.disabledNotes.find(
      (note) => note.paramId === 'temp' && note.primaryOptionId === 'fan_only',
    );
    assert.equal(constantNote?.role, 'constant');
  });
});
