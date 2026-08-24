import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDefaultIrHead,
  catalogCodeToLocalIrFrame,
  classifyCatalogIrCode,
  localIrFrameFromCatalogButton,
} from '../irFrame.js';

describe('classifyCatalogIrCode', () => {
  it('reads even hex from the Cloud API as pulse hex', () => {
    assert.equal(classifyCatalogIrCode('64000000C800'), 'cloud_hex');
  });

  it('reads Tuya timing symbols as a library key', () => {
    assert.equal(classifyCatalogIrCode('02$000CA900'), 'symbol_key');
    assert.equal(classifyCatalogIrCode('002%$003040040100BCBD@^'), 'symbol_key');
  });

  it('reads learned-style base64 as a LAN blob', () => {
    assert.equal(classifyCatalogIrCode('BB4LmVTniQ=='), 'lan_base64');
  });
});

describe('catalogCodeToLocalIrFrame', () => {
  it('converts Cloud hex pulses to a send_button key1', () => {
    const frame = catalogCodeToLocalIrFrame('64000000');
    assert.equal(frame.head, '');
    assert.equal(frame.key1, `1${Buffer.from('64000000', 'hex').toString('base64')}`);
  });

  it('wraps a symbol key as send_key with a 38 kHz head', () => {
    const frame = catalogCodeToLocalIrFrame('02$000CA900');
    assert.equal(frame.head, buildDefaultIrHead());
    assert.equal(frame.head.startsWith('010ED80000000000'), true);
    assert.equal(frame.key1, '002$000CA900');
  });

  it('does not double a device-log 0 prefix on a symbol key', () => {
    const frame = catalogCodeToLocalIrFrame('002$000CA900');
    assert.equal(frame.key1, '002$000CA900');
  });

  it('strips a device-log 1 prefix on a LAN base64 blob', () => {
    const frame = catalogCodeToLocalIrFrame('1BB4LmVTniQ==');
    assert.equal(frame.head, '');
    assert.equal(frame.key1, '1BB4LmVTniQ==');
  });
});

describe('localIrFrameFromCatalogButton', () => {
  it('sends catalog key blobs as library keys, not learned pulses', () => {
    const frame = localIrFrameFromCatalogButton({
      source: 'key',
      code: 'BB4LmVTniQ==',
    });
    assert.equal(frame.head, buildDefaultIrHead());
    assert.equal(frame.key1, '0BB4LmVTniQ==');
  });

  it('keeps learned LAN blobs on the learned key1 prefix', () => {
    const frame = localIrFrameFromCatalogButton({
      source: 'learned',
      code: 'BB4LmVTniQ==',
    });
    assert.equal(frame.head, '');
    assert.equal(frame.key1, '1BB4LmVTniQ==');
  });
});
