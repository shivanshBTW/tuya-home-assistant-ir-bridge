import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bitsToPulses, pulsesToHex } from '../../tuya/irDecode.js';
import { decodeTrainerText } from '../trainerText.js';

describe('decodeTrainerText', () => {
  it('decodes hex and pulse lists and rejects question-mark bits', () => {
    const bits = '1000100000001000110001001000';
    const pulses = bitsToPulses(bits);
    const fromPulses = decodeTrainerText(pulses.join(' '));
    assert.equal(fromPulses.bits, bits);
    const fromHex = decodeTrainerText(pulsesToHex(pulses));
    assert.equal(fromHex.bits, bits);
    const fromBits = decodeTrainerText('1000 1000 0000 1000 1100 0100 1000');
    assert.equal(fromBits.bits, bits);
    assert.throws(() => decodeTrainerText('02$000CA900'), /usable 0\/1 bits/);
  });
});
