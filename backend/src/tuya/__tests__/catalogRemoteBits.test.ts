import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Catalog, CatalogButton, CatalogRemote } from '../../types.js';
import { listCatalogRemoteBits } from '../catalogRemoteBits.js';
import { decodeIrCode, pulsesToBase64, pulsesToHex } from '../irDecode.js';

const hexCode = pulsesToHex([512, 1576, 512, 512]);
const base64Code = pulsesToBase64([512, 1576, 512, 512]);

const button = (overrides: Partial<CatalogButton>): CatalogButton => ({
  id: 'remote:key:power:1',
  remoteId: 'remote',
  key: 'power',
  keyName: 'power',
  source: 'key',
  raw: {},
  ...overrides,
});

const remote = (overrides: Partial<CatalogRemote>): CatalogRemote => ({
  remoteId: 'fan',
  remoteName: 'Bedroom Fan',
  remote: {},
  keys: {},
  learningCodes: {},
  buttons: [],
  ...overrides,
});

const catalog = (remotes: CatalogRemote[]): Catalog => ({
  infraredId: 'hub',
  exportedAt: '2026-01-01T00:00:00.000Z',
  local: { id: 'hub' },
  remotes,
});

describe('listCatalogRemoteBits', () => {
  it('decodes hex and base64 bits and leaves symbol keys empty without leaking code', () => {
    const hexButton = button({
      id: 'lg:hex:cool:1',
      remoteId: 'lg',
      key: 'cool_27',
      keyName: 'Cool 27',
      code: hexCode,
    });
    const base64Button = button({
      id: 'lg:b64:cool:1',
      remoteId: 'lg',
      key: 'cool_26',
      keyName: 'Cool 26',
      source: 'learned',
      code: `1${base64Code}`,
    });
    const symbolButton = button({
      id: 'lg:symbol:cool:1',
      remoteId: 'lg',
      key: 'M0_T27_S2',
      keyName: 'M0_T27_S2',
      code: '02$000CA900',
    });

    const result = listCatalogRemoteBits({
      catalog: catalog([
        remote({
          remoteId: 'fan',
          remoteName: 'Bedroom Fan',
          buttons: [button({ remoteId: 'fan', code: hexCode })],
        }),
        remote({
          remoteId: 'lg',
          remoteName: 'LG Air Conditioner Custom',
          brandName: 'LG',
          buttons: [hexButton, base64Button, symbolButton],
        }),
      ]),
    });

    assert.equal(result.selectedRemoteId, 'lg');
    assert.deepEqual(
      result.buttons.map((item) => item.id),
      [hexButton.id, base64Button.id, symbolButton.id],
    );
    assert.equal(result.buttons[0]?.bits, decodeIrCode(hexCode).bits);
    assert.equal(result.buttons[0]?.kind, 'cloud_hex');
    assert.equal(result.buttons[1]?.bits, decodeIrCode(`1${base64Code}`).bits);
    assert.equal(result.buttons[1]?.kind, 'lan_base64');
    assert.equal(result.buttons[2]?.bits, '');
    assert.equal(result.buttons[2]?.kind, 'symbol_key');
    assert.equal(JSON.stringify(result).includes('"code"'), false);
  });
});
