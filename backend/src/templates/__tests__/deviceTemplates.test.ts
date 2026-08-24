import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTemplateById,
  isSoundbarMediaPlayerSlotId,
  isTvMediaPlayerSlotId,
  listAcButtonSlots,
  listAcPowerSavingSlots,
  listMappedSoundbarButtonSlots,
  listMappedTvButtonSlots,
  listSoundbarButtonSlots,
  listTvButtonSlots,
  resolveMappedFanSpeedSlotId,
} from '../deviceTemplates.js';

describe('TV template slots', () => {
  it('keeps Google media_player commands separate from HA-only buttons', () => {
    assert.equal(isTvMediaPlayerSlotId('power'), true);
    assert.equal(isTvMediaPlayerSlotId('source_hdmi'), true);
    assert.equal(isTvMediaPlayerSlotId('home'), false);
    assert.equal(isTvMediaPlayerSlotId('netflix'), false);
    assert.equal(isTvMediaPlayerSlotId('source_hdmi_cycle'), false);
  });

  it('includes Google TV-style buttons on the TV template', () => {
    const slotIds = getTemplateById('tv').slots.map((slot) => slot.id);
    for (const slotId of [
      'home',
      'back',
      'exit',
      'ok',
      'input',
      'source_hdmi_cycle',
      'source_hdmi',
      'netflix',
      'youtube',
      'settings',
      'memc_off',
      'brightness_min',
      'brightness_max',
      'wifi',
      'bluetooth',
    ]) {
      assert.equal(slotIds.includes(slotId), true, slotId);
    }
  });

  it('only publishes mapped extra TV slots as HA buttons', () => {
    const mapped = listMappedTvButtonSlots({
      id: 'vu_tv',
      name: 'Vu TV',
      template: 'tv',
      tuyaRemoteId: 'remote-1',
      slots: {
        power: { buttonId: 'b-power' },
        home: { buttonId: 'b-home' },
        netflix: { buttonId: 'b-netflix' },
      },
      assumedState: { isOn: false, isMuted: false },
    });
    assert.deepEqual(
      mapped.map((slot) => slot.id),
      ['home', 'netflix'],
    );
    assert.equal(
      listTvButtonSlots().some((slot) => slot.id === 'power'),
      false,
    );
  });
});

describe('Soundbar template slots', () => {
  it('keeps Google speaker commands separate from HA-only buttons', () => {
    assert.equal(isSoundbarMediaPlayerSlotId('power'), true);
    assert.equal(isSoundbarMediaPlayerSlotId('next'), true);
    assert.equal(isSoundbarMediaPlayerSlotId('previous'), true);
    assert.equal(isSoundbarMediaPlayerSlotId('mute'), true);
    assert.equal(isSoundbarMediaPlayerSlotId('input'), false);
    assert.equal(isSoundbarMediaPlayerSlotId('equalize'), false);
  });

  it('matches the Zeb Soundbar catalog extras', () => {
    const slotIds = getTemplateById('soundbar').slots.map((slot) => slot.id);
    assert.deepEqual(slotIds, [
      'power',
      'vol_up',
      'vol_down',
      'mute',
      'next',
      'previous',
      'input',
      'settings',
      'equalize',
      'settings_up',
      'settings_down',
      'pair',
    ]);
    assert.deepEqual(
      listSoundbarButtonSlots().map((slot) => slot.id),
      ['input', 'settings', 'equalize', 'settings_up', 'settings_down', 'pair'],
    );
  });

  it('only publishes mapped extra soundbar slots as HA buttons', () => {
    const mapped = listMappedSoundbarButtonSlots({
      id: 'zeb_soundbar',
      name: 'Zeb Soundbar',
      template: 'soundbar',
      tuyaRemoteId: 'remote-1',
      slots: {
        power: { buttonId: 'b-power' },
        input: { buttonId: 'b-input' },
        equalize: { buttonId: 'b-eq' },
      },
      assumedState: { isOn: false, isMuted: false },
    });
    assert.deepEqual(
      mapped.map((slot) => slot.id),
      ['input', 'equalize'],
    );
  });
});

describe('Fan speed slots', () => {
  it('uses the highest mapped speed when HA asks for an unmapped speed 6', () => {
    assert.equal(
      resolveMappedFanSpeedSlotId({
        slots: {
          speed_1: { buttonId: 's1' },
          speed_5: { buttonId: 's5' },
        },
        speed: 6,
      }),
      'speed_5',
    );
  });

  it('uses a mapped max slot when no speed keys exist', () => {
    assert.equal(
      resolveMappedFanSpeedSlotId({
        slots: { max: { buttonId: 'boost' } },
        speed: 6,
      }),
      'max',
    );
  });

  it('treats max as speed 6 / boost instead of walking down to speed 5', () => {
    assert.equal(
      resolveMappedFanSpeedSlotId({
        slots: {
          speed_5: { buttonId: 's5' },
          max: { buttonId: 'boost' },
        },
        speed: 6,
      }),
      'max',
    );
  });
});

describe('AC template slots', () => {
  it('only lists extras that exist on the custom remote, not climate library keys', () => {
    const slotIds = getTemplateById('ac').slots.map((slot) => slot.id);
    assert.deepEqual(slotIds, [
      'power_saving_40',
      'power_saving_60',
      'power_saving_80',
      'power_saving_100',
      'sleep',
      'timer',
    ]);
    assert.equal(slotIds.includes('mode_heat'), false);
    assert.equal(
      listAcButtonSlots()
        .map((slot) => slot.id)
        .join(','),
      'sleep,timer',
    );
    assert.equal(listAcPowerSavingSlots().length, 4);
  });
});
