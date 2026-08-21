import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatMacAddress, normalizeMacAddress, parseNeighborTable } from '../macAddress.js';

describe('normalizeMacAddress', () => {
  it('accepts colon, dash, and bare hex', () => {
    assert.equal(normalizeMacAddress('AA:BB:CC:DD:EE:FF'), 'aabbccddeeff');
    assert.equal(normalizeMacAddress('aa-bb-cc-dd-ee-ff'), 'aabbccddeeff');
    assert.equal(normalizeMacAddress('AABBCCDDEEFF'), 'aabbccddeeff');
  });

  it('rejects the wrong length', () => {
    assert.throws(() => normalizeMacAddress('aa:bb:cc:dd:ee'), /Invalid MAC address/);
  });
});

describe('formatMacAddress', () => {
  it('formats a canonical colon-separated MAC', () => {
    assert.equal(formatMacAddress('AA-BB-CC-DD-EE-FF'), 'aa:bb:cc:dd:ee:ff');
  });
});

describe('parseNeighborTable', () => {
  it('parses macOS arp -an output', () => {
    const output = [
      '? (192.168.1.1) at 14:eb:b6:11:22:33 on en0 ifscope [ethernet]',
      '? (192.168.1.15) at (incomplete) on en0 ifscope [ethernet]',
      '? (192.168.1.40) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]',
    ].join('\n');

    assert.deepEqual(parseNeighborTable(output), {
      '14ebb6112233': '192.168.1.1',
      aabbccddeeff: '192.168.1.40',
    });
  });

  it('parses Linux ip neigh output', () => {
    const output = [
      '192.168.1.1 dev wlan0 lladdr 14:eb:b6:11:22:33 REACHABLE',
      '192.168.1.40 dev wlan0 lladdr aa-bb-cc-dd-ee-ff STALE',
    ].join('\n');

    assert.deepEqual(parseNeighborTable(output), {
      '14ebb6112233': '192.168.1.1',
      aabbccddeeff: '192.168.1.40',
    });
  });

  it('parses Windows arp -a output', () => {
    const output = [
      'Interface: 192.168.1.5 --- 0x3',
      '  Internet Address      Physical Address      Type',
      '  192.168.1.40           aa-bb-cc-dd-ee-ff     dynamic',
    ].join('\n');

    assert.equal(parseNeighborTable(output).aabbccddeeff, '192.168.1.40');
  });
});
