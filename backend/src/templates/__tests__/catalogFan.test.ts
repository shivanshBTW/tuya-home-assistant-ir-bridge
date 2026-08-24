import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Catalog, CatalogButton } from '../../types.js';
import {
  catalogFanButtonSlug,
  findCatalogFanExtraButton,
  findCatalogFanPowerButton,
  isDirectCatalogFan,
  listCatalogFanExtraButtons,
  listCatalogFanSpeedButtons,
  resolveCatalogFanSpeedButton,
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

describe('isDirectCatalogFan', () => {
  it('uses catalog keys when the fan has no mapped power slot', () => {
    assert.equal(
      isDirectCatalogFan({
        id: 'bedroom_fan',
        name: 'Bedroom Fan',
        template: 'fan',
        tuyaRemoteId: 'fan-remote',
        slots: {},
        assumedState: { isOn: false, speed: 1, isLedOn: false },
      }),
      true,
    );
    assert.equal(
      isDirectCatalogFan({
        id: 'mapped_fan',
        name: 'Mapped Fan',
        template: 'fan',
        tuyaRemoteId: 'fan-remote',
        slots: { power: { buttonId: 'x' } },
        assumedState: { isOn: false, speed: 1, isLedOn: false },
      }),
      false,
    );
  });
});

describe('catalog fan key lookup', () => {
  it('finds power and numbered speeds without slot mapping', () => {
    assert.equal(findCatalogFanPowerButton({ catalog, remoteId: 'fan-remote' }).key, 'power');
    assert.deepEqual(
      listCatalogFanSpeedButtons({ catalog, remoteId: 'fan-remote' }).map((item) => item.speed),
      [1, 2, 5],
    );
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
      'fan_speed5',
    );
  });

  it('lists leftover keys as extras, including learned speed plus', () => {
    const extras = listCatalogFanExtraButtons({ catalog, remoteId: 'fan-remote' });
    assert.deepEqual(
      extras.map((item) => catalogFanButtonSlug(item)),
      ['boost', 'sleep', 'fan_speed_plus', 'fan_speed_minus'],
    );
    assert.equal(
      findCatalogFanExtraButton({ catalog, remoteId: 'fan-remote', slug: 'boost' }).key,
      'boost',
    );
  });
});
