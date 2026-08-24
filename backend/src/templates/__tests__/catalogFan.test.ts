import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Catalog, CatalogButton, DeviceMapping } from '../../types.js';
import {
  catalogFanButtonSlug,
  catalogFanSpeedRangeMax,
  findCatalogFanExtraButton,
  findCatalogFanPowerButton,
  listCatalogFanExtraButtons,
  listCatalogFanSpeedButtons,
  resolveCatalogFanSpeedButton,
  resolveFanPowerButtonToSend,
  resolveFanSpeedButtonToSend,
} from '../catalogFan.js';

const button = (
  overrides: Partial<CatalogButton> & Pick<CatalogButton, 'key' | 'keyName'>,
): CatalogButton => ({
  id: `${overrides.key}-id`,
  remoteId: 'fan-remote',
  source: 'key',
  code: 'token',
  raw: {},
  ...overrides,
});

const catalog: Catalog = {
  infraredId: 'hub',
  exportedAt: '2026-01-01T00:00:00.000Z',
  local: { id: 'hub' },
  remotes: [
    {
      remoteId: 'fan-remote',
      remoteName: 'Bedroom Fan',
      remote: {},
      keys: {},
      learningCodes: {},
      buttons: [
        button({ key: 'power', keyName: 'power' }),
        button({ key: 'PowerOn', keyName: 'power on', code: undefined }),
        button({ key: 'fan_speed1', keyName: 'Fan_speed1' }),
        button({ key: 'FAN_SPEED2', keyName: 'FAN_SPEED2' }),
        button({ key: 'fan_speed5', keyName: 'FAN_SPEED5' }),
        button({ key: 'boost', keyName: 'BOOST' }),
        button({ key: 'sleep', keyName: 'SLEEP' }),
        button({
          id: 'learned-up',
          key: '1787',
          keyName: 'Fan Speed +',
          source: 'learned',
        }),
        button({
          id: 'learned-down',
          key: '1788',
          keyName: 'Fan Speed -',
          source: 'learned',
        }),
      ],
    },
  ],
};

const fanDevice = (slots: DeviceMapping['slots']): DeviceMapping => ({
  id: 'bedroom_fan',
  name: 'Bedroom Fan',
  template: 'fan',
  tuyaRemoteId: 'fan-remote',
  slots,
  assumedState: { isOn: false, speed: 1, isLedOn: false },
});

describe('catalog fan key lookup', () => {
  it('treats boost as speed 6 / max / 100%', () => {
    assert.equal(findCatalogFanPowerButton({ catalog, remoteId: 'fan-remote' }).key, 'power');
    assert.deepEqual(
      listCatalogFanSpeedButtons({ catalog, remoteId: 'fan-remote' }).map((item) => ({
        speed: item.speed,
        key: item.button.key,
      })),
      [
        { speed: 1, key: 'fan_speed1' },
        { speed: 2, key: 'FAN_SPEED2' },
        { speed: 5, key: 'fan_speed5' },
        { speed: 6, key: 'boost' },
      ],
    );
    assert.equal(catalogFanSpeedRangeMax({ catalog, remoteId: 'fan-remote' }), 6);
    assert.equal(
      resolveCatalogFanSpeedButton({ catalog, remoteId: 'fan-remote', speed: 2 }).key,
      'FAN_SPEED2',
    );
    assert.equal(
      resolveCatalogFanSpeedButton({ catalog, remoteId: 'fan-remote', speed: 4 }).key,
      'FAN_SPEED2',
    );
    assert.equal(
      resolveCatalogFanSpeedButton({ catalog, remoteId: 'fan-remote', speed: 6 }).key,
      'boost',
    );
    assert.equal(
      resolveCatalogFanSpeedButton({ catalog, remoteId: 'fan-remote', speed: 100 }).key,
      'boost',
    );
  });

  it('keeps leftover keys as extras and omits boost', () => {
    const extras = listCatalogFanExtraButtons({ catalog, remoteId: 'fan-remote' });
    assert.deepEqual(
      extras.map((item) => catalogFanButtonSlug(item)),
      ['sleep', 'fan_speed_plus', 'fan_speed_minus'],
    );
    assert.equal(
      findCatalogFanExtraButton({ catalog, remoteId: 'fan-remote', slug: 'sleep' }).key,
      'sleep',
    );
  });
});

describe('fan slot overrides', () => {
  it('uses catalog keys until a slot is mapped', () => {
    assert.equal(resolveFanPowerButtonToSend({ catalog, device: fanDevice({}) }).label, 'power');
    assert.equal(
      resolveFanSpeedButtonToSend({ catalog, device: fanDevice({}), speed: 6 }).label,
      'boost',
    );
    assert.equal(
      resolveFanPowerButtonToSend({
        catalog,
        device: fanDevice({ power: { buttonId: 'mapped-power' } }),
      }).buttonId,
      'mapped-power',
    );
    assert.equal(
      resolveFanSpeedButtonToSend({
        catalog,
        device: fanDevice({ max: { buttonId: 'mapped-max' } }),
        speed: 100,
      }).buttonId,
      'mapped-max',
    );
    assert.equal(
      resolveFanSpeedButtonToSend({
        catalog,
        device: fanDevice({
          speed_5: { buttonId: 'mapped-5' },
          speed_6: { buttonId: 'mapped-6' },
        }),
        speed: 6,
      }).buttonId,
      'mapped-6',
    );
    assert.equal(
      resolveFanSpeedButtonToSend({
        catalog,
        device: fanDevice({ speed_5: { buttonId: 'mapped-5' } }),
        speed: 6,
      }).label,
      'boost',
    );
  });
});
