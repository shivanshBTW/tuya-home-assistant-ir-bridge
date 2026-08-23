import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  base64ToPulses,
  bitsToPulses,
  compareIrBits,
  compareIrPulses,
  decodeIrCode,
  hexToPulses,
  parseIrBitString,
  pulsesToBase64,
  pulsesToBits,
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
    assert.equal(decode.symbols, '');
    assert.equal(decode.bits, '');
  });
});

describe('compareIrPulses', () => {
  it('ignores jitter inside the same short or long bucket', () => {
    assert.deepEqual(
      compareIrPulses({
        left: [512, 1576, 512, 512],
        right: [491, 1568, 544, 544],
      }),
      [],
    );
  });

  it('lists indexes where short vs long actually changes', () => {
    assert.deepEqual(
      compareIrPulses({
        left: [512, 512, 512, 1576],
        right: [491, 1568, 544, 544],
      }),
      [
        { index: 1, left: 512, right: 1568 },
        { index: 3, left: 1576, right: 544 },
      ],
    );
  });
});

describe('pulsesToBits', () => {
  it('reads LG-style temp bits after snapping jitter', () => {
    const cool27 = [
      3063, 9841, 512, 1576, 512, 512, 512, 563, 512, 512, 512, 1576, 512, 512, 512, 512, 512, 512,
      512, 512, 512, 512, 512, 512, 512, 512, 512, 1576, 512, 512, 512, 512, 512, 512, 512, 1576,
      512, 1576, 512, 512, 512, 512, 512, 512, 512, 1576, 512, 512, 512, 563, 512, 1576, 512, 512,
      512, 512, 512, 512, 512, 30000,
    ];
    const cool26 = [
      2999, 9902, 491, 1568, 491, 544, 491, 544, 491, 544, 491, 1568, 491, 544, 491, 544, 491, 544,
      491, 544, 491, 544, 491, 544, 491, 544, 491, 1568, 491, 544, 491, 544, 544, 491, 544, 1568,
      491, 544, 491, 1568, 491, 1568, 491, 544, 491, 1568, 491, 544, 491, 544, 491, 544, 491, 1568,
      491, 1568, 544, 1568, 544, 30000,
    ];
    assert.equal(pulsesToBits(cool27), '1000100000001000110001001000');
    assert.equal(pulsesToBits(cool26), '1000100000001000101101000111');
    assert.equal(pulsesToBits(cool27).slice(16, 20), '1100');
    assert.equal(pulsesToBits(cool26).slice(16, 20), '1011');
    assert.deepEqual(compareIrBits({ left: pulsesToBits(cool27), right: pulsesToBits(cool26) }), [
      { index: 17, left: '1', right: '0' },
      { index: 18, left: '0', right: '1' },
      { index: 19, left: '0', right: '1' },
      { index: 24, left: '1', right: '0' },
      { index: 25, left: '0', right: '1' },
      { index: 26, left: '0', right: '1' },
      { index: 27, left: '0', right: '1' },
    ]);
  });
});

describe('bitsToPulses', () => {
  it('round-trips the 27C LG bit string', () => {
    const cool27Bits = '1000100000001000110001001000';
    assert.equal(pulsesToBits(bitsToPulses(cool27Bits)), cool27Bits);
    assert.equal(parseIrBitString('1000 1000 0000 1000 1100 0100 1000'), cool27Bits);
  });

  it('rejects non-bit characters', () => {
    assert.throws(() => bitsToPulses('1002'), /bits must be a 0\/1 string/);
  });
});
