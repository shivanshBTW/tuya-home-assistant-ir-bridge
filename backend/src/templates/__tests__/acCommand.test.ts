import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Catalog, ClimateAssumedState } from '../../types.js';
import {
  applyAcFanModeCommand,
  applyAcModeCommand,
  applyAcPowerCommand,
  applyAcTemperatureCommand,
  countAcTemperatureUpSteps,
  findAcLibraryButton,
  findAcPowerButton,
  listAcClimateButtonsToSend,
  publishedAcFanMode,
  resolveAcLibraryKey,
} from '../acCommand.js';

const coolState = (overrides: Partial<ClimateAssumedState> = {}): ClimateAssumedState => ({
  isOn: true,
  mode: 'cool',
  temperatureC: 24,
  fanMode: 'medium',
  ...overrides,
});

const catalog: Catalog = {
  infraredId: 'hub',
  exportedAt: '2026-01-01T00:00:00.000Z',
  local: { id: 'hub' },
  remotes: [
    {
      remoteId: 'bedroom-ac',
      remote: {},
      keys: {},
      learningCodes: [],
      buttons: [
        {
          id: 'on',
          remoteId: 'bedroom-ac',
          key: 'power_on',
          keyName: 'power on',
          source: 'key',
          raw: {},
        },
        {
          id: 'off',
          remoteId: 'bedroom-ac',
          key: 'power_off',
          keyName: 'power off',
          source: 'key',
          raw: {},
        },
        {
          id: 'cool',
          remoteId: 'bedroom-ac',
          key: 'M0_T24_S2',
          keyName: 'M0_T24_S2',
          source: 'key',
          raw: {},
        },
        {
          id: 'dry',
          remoteId: 'bedroom-ac',
          key: 'M4_S1',
          keyName: 'M4_S1',
          source: 'key',
          raw: {},
        },
        {
          id: 'fan',
          remoteId: 'bedroom-ac',
          key: 'M3_T24_S3',
          keyName: 'M3_T24_S3',
          source: 'key',
          raw: {},
        },
      ],
    },
  ],
};

describe('resolveAcLibraryKey', () => {
  it('sends cool as M0 with temp and S2 as medium', () => {
    assert.equal(
      resolveAcLibraryKey({ mode: 'cool', temperatureC: 24, fanMode: 'medium' }),
      'M0_T24_S2',
    );
  });

  it('sends dry as M4_S1 only', () => {
    assert.equal(resolveAcLibraryKey({ mode: 'dry', temperatureC: 22, fanMode: 'high' }), 'M4_S1');
  });

  it('sends fan-only with last cool temp as dummy T and never S0', () => {
    assert.equal(
      resolveAcLibraryKey({ mode: 'fan_only', temperatureC: 24, fanMode: 'high' }),
      'M3_T24_S3',
    );
    assert.equal(
      resolveAcLibraryKey({ mode: 'cool', temperatureC: 24, fanMode: 'low' }).includes('_S0'),
      false,
    );
  });
});

describe('applyAc climate commands', () => {
  it('ignores temperature in dry and fan-only', () => {
    assert.equal(
      applyAcTemperatureCommand({ state: coolState({ mode: 'dry' }), temperatureC: 20 }),
      undefined,
    );
    assert.equal(
      applyAcTemperatureCommand({ state: coolState({ mode: 'fan_only' }), temperatureC: 20 }),
      undefined,
    );
  });

  it('honors temperature in cool and turns the unit on', () => {
    const nextState = applyAcTemperatureCommand({
      state: coolState({ isOn: false, temperatureC: 24 }),
      temperatureC: 26,
    });
    assert.equal(nextState?.isOn, true);
    assert.equal(nextState?.temperatureC, 26);
    assert.equal(nextState?.mode, 'cool');
  });

  it('ignores fan speed in dry, publishes low, and remembers the previous speed', () => {
    const dryState = applyAcModeCommand({ state: coolState({ fanMode: 'high' }), mode: 'dry' });
    assert.ok(dryState);
    assert.equal(dryState.fanMode, 'high');
    assert.equal(publishedAcFanMode(dryState), 'low');
    assert.equal(applyAcFanModeCommand({ state: dryState, fanMode: 'medium' }), undefined);
  });

  it('ignores heat and auto modes', () => {
    assert.equal(applyAcModeCommand({ state: coolState(), mode: 'heat' }), undefined);
    assert.equal(applyAcModeCommand({ state: coolState(), mode: 'auto' }), undefined);
  });

  it('keeps power off from changing mode', () => {
    const nextState = applyAcPowerCommand({
      state: coolState({ mode: 'fan_only' }),
      isOn: false,
    });
    assert.equal(nextState.isOn, false);
    assert.equal(nextState.mode, 'fan_only');
  });
});

describe('findAc library buttons', () => {
  it('finds separate power on and off keys', () => {
    assert.equal(
      findAcPowerButton({ catalog, remoteId: 'bedroom-ac', isOn: true }).key,
      'power_on',
    );
    assert.equal(
      findAcPowerButton({ catalog, remoteId: 'bedroom-ac', isOn: false }).key,
      'power_off',
    );
  });

  it('looks up the cool medium key from assumed state', () => {
    assert.equal(
      findAcLibraryButton({ catalog, remoteId: 'bedroom-ac', state: coolState() }).key,
      'M0_T24_S2',
    );
  });

  it('uses a sibling library remote when the mapped custom remote has no M_T_S keys', () => {
    const catalogWithCustom: Catalog = {
      ...catalog,
      remotes: [
        {
          remoteId: 'lg-custom',
          remote: {},
          keys: {},
          learningCodes: [],
          buttons: [
            {
              id: 'custom-on',
              remoteId: 'lg-custom',
              key: 'PowerOn',
              keyName: 'PowerOn',
              source: 'key',
              raw: {},
            },
            {
              id: 'custom-fan',
              remoteId: 'lg-custom',
              key: 'F',
              keyName: 'F',
              source: 'key',
              raw: {},
            },
          ],
        },
        ...catalog.remotes,
      ],
    };

    assert.equal(
      findAcLibraryButton({
        catalog: catalogWithCustom,
        remoteId: 'lg-custom',
        state: coolState({ temperatureC: 24, fanMode: 'medium' }),
      }).id,
      'cool',
    );
    assert.equal(
      findAcPowerButton({ catalog: catalogWithCustom, remoteId: 'lg-custom', isOn: true }).key,
      'PowerOn',
    );
  });
});

describe('listAcClimateButtonsToSend', () => {
  const learnedButton = ({
    id,
    key,
    keyName,
  }: {
    id: string;
    key: string;
    keyName: string;
  }): Catalog['remotes'][number]['buttons'][number] => ({
    id,
    remoteId: 'lg-custom',
    key,
    keyName,
    source: 'learned',
    code: 'learned-code',
    raw: {},
  });

  const catalogWithLearned: Catalog = {
    ...catalog,
    remotes: [
      {
        remoteId: 'lg-custom',
        remote: {},
        keys: {},
        learningCodes: [],
        buttons: [
          {
            id: 'custom-on',
            remoteId: 'lg-custom',
            key: 'PowerOn',
            keyName: 'power on',
            source: 'key',
            raw: {},
          },
          {
            id: 'custom-temp',
            remoteId: 'lg-custom',
            key: 'T',
            keyName: 'temperature',
            source: 'key',
            raw: {},
          },
          learnedButton({ id: 'custom-cold', key: '1787cold', keyName: 'Cold' }),
          learnedButton({ id: 'custom-dry', key: '1787dry', keyName: 'Dehumidify' }),
          learnedButton({ id: 'custom-fan-only', key: '1787fo', keyName: 'Fan Only Mode' }),
          learnedButton({ id: 'custom-fan-1', key: '1787f1', keyName: 'Fan 1' }),
          learnedButton({ id: 'custom-fan-2', key: '1787f2', keyName: 'Fan 2' }),
          learnedButton({ id: 'custom-fan-3', key: '1787f3', keyName: 'Fan 3' }),
        ],
      },
      ...catalog.remotes,
    ],
  };

  it('sends learned Fan 3 instead of a Bedroom library frame', () => {
    const buttons = listAcClimateButtonsToSend({
      catalog: catalogWithLearned,
      remoteId: 'lg-custom',
      previousState: coolState({ fanMode: 'medium' }),
      nextState: coolState({ fanMode: 'high' }),
    });
    assert.deepEqual(
      buttons.map((button) => button.keyName),
      ['Fan 3'],
    );
  });

  it('steps temperature up with wrap using the Custom T key', () => {
    assert.equal(countAcTemperatureUpSteps({ fromC: 24, toC: 23 }), 14);
    const buttons = listAcClimateButtonsToSend({
      catalog: catalogWithLearned,
      remoteId: 'lg-custom',
      previousState: coolState({ temperatureC: 24 }),
      nextState: coolState({ temperatureC: 23 }),
    });
    assert.equal(buttons.length, 14);
    assert.equal(buttons[0]?.key, 'T');
  });

  it('falls back to the library key when no learned climate buttons exist', () => {
    const buttons = listAcClimateButtonsToSend({
      catalog,
      remoteId: 'bedroom-ac',
      previousState: coolState(),
      nextState: coolState(),
    });
    assert.equal(buttons[0]?.key, 'M0_T24_S2');
  });
});
