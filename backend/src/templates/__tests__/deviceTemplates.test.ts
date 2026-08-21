import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTemplateById,
  isTvMediaPlayerSlotId,
  listMappedTvButtonSlots,
  listTvButtonSlots,
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
