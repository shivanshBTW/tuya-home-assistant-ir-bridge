import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLanIpv4 } from '../lanAddress.js';

describe('isLanIpv4', () => {
  it('accepts private IPv4 ranges', () => {
    assert.equal(isLanIpv4('192.168.1.51'), true);
    assert.equal(isLanIpv4('10.0.0.5'), true);
    assert.equal(isLanIpv4('172.16.0.1'), true);
    assert.equal(isLanIpv4('172.31.255.255'), true);
  });

  it('rejects public and invalid addresses', () => {
    assert.equal(isLanIpv4('182.77.77.110'), false);
    assert.equal(isLanIpv4('203.0.113.10'), false);
    assert.equal(isLanIpv4('8.8.8.8'), false);
    assert.equal(isLanIpv4('172.15.0.1'), false);
    assert.equal(isLanIpv4('not-an-ip'), false);
  });
});
