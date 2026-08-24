import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TrainerSample } from '../../types.js';
import { generateTrainerGrid } from '../trainerGenerate.js';
import { inferTrainerFields } from '../trainerInfer.js';
import { createDefaultAcTrainerSchema, listLegalTrainerStates } from '../trainerPlan.js';

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

const encodeFrame = ({
  tempBits,
  speedBits,
  checksumBits,
}: {
  tempBits: string;
  speedBits: string;
  checksumBits: string;
}): string => {
  return `${PREFIX}${tempBits}${speedBits}${checksumBits}`;
};

describe('listLegalTrainerStates', () => {
  it('lists cool temp×speed without powerSaving and omits disabled fan temp', () => {
    const schema = createDefaultAcTrainerSchema();
    const states = listLegalTrainerStates(schema);
    const coolStates = states.filter((paramValues) => paramValues.mode === 'cool');
    const fanStates = states.filter((paramValues) => paramValues.mode === 'fan_only');
    assert.equal(coolStates.length, 15 * 3);
    assert.equal(
      coolStates.every((paramValues) => paramValues.powerSaving === undefined),
      true,
    );
    assert.equal(fanStates.length, 3);
    assert.equal(
      fanStates.every((paramValues) => paramValues.temp === undefined),
      true,
    );
  });
});

describe('generateTrainerGrid', () => {
  it('generates missing cool temps with a nibble-sum checksum and leaves power saving empty', () => {
    const schema = createDefaultAcTrainerSchema();
    const samples = [
      sample({
        id: '16',
        receivedAt: '2026-01-01T00:00:00.000Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '16', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000000100101011',
      }),
      sample({
        id: '23',
        receivedAt: '2026-01-01T00:00:00.500Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '23', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000100000100010',
      }),
      sample({
        id: '24',
        receivedAt: '2026-01-01T00:00:01.000Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000100100100011',
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
    const generation = generateTrainerGrid({ schema, samples, inference });
    assert.equal(generation.checksumKind, 'nibble_sum');
    const cool18Medium = generation.cells.find(
      (cell) =>
        cell.kind === 'frame' &&
        cell.paramValues.mode === 'cool' &&
        cell.paramValues.temp === '18' &&
        cell.paramValues.speed === 'medium',
    );
    assert.equal(cool18Medium?.status, 'generated');
    assert.equal(cool18Medium?.bits, '1000100000001000001100101101');
    const cool24High = generation.cells.find(
      (cell) =>
        cell.kind === 'frame' &&
        cell.paramValues.mode === 'cool' &&
        cell.paramValues.temp === '24' &&
        cell.paramValues.speed === 'high',
    );
    assert.equal(cool24High?.status, 'generated');
    assert.equal(
      cool24High?.bits,
      encodeFrame({ tempBits: '1001', speedBits: '0100', checksumBits: '0101' }),
    );
    const dry24 = generation.cells.find(
      (cell) =>
        cell.kind === 'frame' && cell.paramValues.mode === 'dry' && cell.paramValues.temp === '24',
    );
    assert.equal(dry24?.status, 'generated');
    assert.equal(dry24?.bits, '1000100000001001100100000010');
    const powerSaving40 = generation.cells.find(
      (cell) => cell.kind === 'command' && cell.paramValues.powerSaving === '40',
    );
    assert.equal(powerSaving40?.status, 'captured');
    const powerSaving60 = generation.cells.find(
      (cell) => cell.kind === 'command' && cell.paramValues.powerSaving === '60',
    );
    assert.equal(powerSaving60?.status, 'needs_input');
    assert.equal(
      generation.cells.filter(
        (cell) => cell.kind === 'frame' && cell.paramValues.powerSaving !== undefined,
      ).length,
      0,
    );
    assert.equal(
      generation.cells.filter((cell) => cell.kind === 'command' && cell.paramValues.powerSaving)
        .length,
      4,
    );
    const powerOn = generation.cells.find(
      (cell) => cell.kind === 'command' && cell.paramValues.power === 'on',
    );
    const powerOff = generation.cells.find(
      (cell) => cell.kind === 'command' && cell.paramValues.power === 'off',
    );
    assert.equal(powerOn?.status, 'needs_input');
    assert.equal(powerOff?.status, 'needs_input');
    assert.equal(generation.cells.filter((cell) => cell.kind === 'command').length, 6);
  });

  it('keeps power saving off when leftover climate labels match a different packet', () => {
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
        id: 'ps-off',
        receivedAt: '2026-01-01T00:00:04.000Z',
        unlockedParamId: 'powerSaving',
        paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: 'off' },
        bits: '1000100011000000011111110010',
      }),
    ];
    const inference = inferTrainerFields({ schema, samples });
    const generation = generateTrainerGrid({ schema, samples, inference });
    const powerSavingOff = generation.cells.find(
      (cell) => cell.kind === 'command' && cell.paramValues.powerSaving === 'off',
    );
    assert.equal(powerSavingOff?.status, 'captured');
    assert.equal(powerSavingOff?.bits, '1000100011000000011111110010');
  });

  it('does not generate 24C from a Power On packet that looks like 26C', () => {
    const schema = createDefaultAcTrainerSchema();
    const samples = [
      sample({
        id: '16',
        receivedAt: '2026-01-01T00:00:00.000Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '16', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000000100101011',
      }),
      sample({
        id: '23',
        receivedAt: '2026-01-01T00:00:00.500Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '23', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000100000100010',
      }),
      sample({
        id: '24',
        receivedAt: '2026-01-01T00:00:01.000Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '24', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000100100100011',
      }),
      sample({
        id: '30',
        receivedAt: '2026-01-01T00:00:01.500Z',
        unlockedParamId: 'temp',
        paramValues: { mode: 'cool', temp: '30', speed: 'medium', powerSaving: 'off' },
        bits: '1000100000001000111100101001',
      }),
      sample({
        id: 'power-on',
        receivedAt: '2026-01-01T00:00:05.000Z',
        unlockedParamId: 'power',
        paramValues: { mode: 'cool', temp: '24', speed: 'medium', power: 'on' },
        bits: '1000100000000000101100101101',
      }),
    ];
    const inference = inferTrainerFields({ schema, samples });
    const generation = generateTrainerGrid({ schema, samples, inference });
    const cool24Medium = generation.cells.find(
      (cell) =>
        cell.kind === 'frame' &&
        cell.paramValues.mode === 'cool' &&
        cell.paramValues.temp === '24' &&
        cell.paramValues.speed === 'medium',
    );
    const cool18Medium = generation.cells.find(
      (cell) =>
        cell.kind === 'frame' &&
        cell.paramValues.mode === 'cool' &&
        cell.paramValues.temp === '18' &&
        cell.paramValues.speed === 'medium',
    );
    assert.equal(cool24Medium?.bits, '1000100000001000100100100011');
    assert.equal(cool18Medium?.status, 'generated');
    assert.equal(cool18Medium?.bits, '1000100000001000001100101101');
  });
});
