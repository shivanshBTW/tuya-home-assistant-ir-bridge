import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64ToPulses,
  compareIrPulses,
  decodeIrCode,
  hexToPulses,
  pulsesToBase64,
  pulsesToHex,
} from '../irDecode.js';

describe('decodeIrCode', () => {
  it('round-trips Cloud hex pulses', () => {
    const hex = pulsesToHex([100, 200, 300]);
    const decode = decodeIrCode(hex);
    assert.equal(decode.kind, 'cloud_hex');
    assert.deepEqual(decode.pulses, [100, 200, 300]);
    assert.equal(decode.pulseCount, 3);
    assert.deepEqual(hexToPulses(hex), [100, 200, 300]);
  });

  it('reads a LAN base64 blob including a leading 1', () => {
    const base64 = pulsesToBase64([562, 1687, 562]);
    const decode = decodeIrCode(`1${base64}`);
    assert.equal(decode.kind, 'lan_base64');
    assert.deepEqual(decode.pulses, [562, 1687, 562]);
    assert.equal(decode.base64, base64);
    assert.deepEqual(base64ToPulses(`1${base64}`), [562, 1687, 562]);
  });

  it('does not invent pulses for a symbol key', () => {
    const decode = decodeIrCode('02$000CA900');
    assert.equal(decode.kind, 'symbol_key');
    assert.deepEqual(decode.pulses, []);
    assert.equal(decode.pulseCount, 0);
  });
});

describe('compareIrPulses', () => {
  it('lists indexes where two captures differ', () => {
    assert.deepEqual(
      compareIrPulses({
        left: [100, 200, 300],
        right: [100, 250, 300, 400],
      }),
      [
        { index: 1, left: 200, right: 250 },
        { index: 3, right: 400 },
      ],
    );
  });
});
