import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTuyaLocalHost } from '../resolveLocalHost.js';

const DEVICE_ID = 'bf-test-device';

describe('resolveTuyaLocalHost', () => {
  it('uses the configured IP when it is set', async () => {
    let didLookupMac = false;
    let didDiscover = false;

    const resolved = await resolveTuyaLocalHost({
      configuredIp: '192.168.1.40',
      configuredMac: 'aa:bb:cc:dd:ee:ff',
      fallbackHost: '203.0.113.10',
      deviceId: DEVICE_ID,
      lookupIp: async () => {
        didLookupMac = true;
        return '192.168.1.99';
      },
      discoverHost: async () => {
        didDiscover = true;
        return { host: '192.168.1.50' };
      },
    });

    assert.deepEqual(resolved, { host: '192.168.1.40' });
    assert.equal(didLookupMac, false);
    assert.equal(didDiscover, false);
  });

  it('looks up a MAC when no IP is set', async () => {
    const resolved = await resolveTuyaLocalHost({
      configuredMac: 'aa:bb:cc:dd:ee:ff',
      fallbackHost: '203.0.113.10',
      deviceId: DEVICE_ID,
      lookupIp: async ({ mac, shouldScanSubnet }) => {
        assert.equal(mac, 'aa:bb:cc:dd:ee:ff');
        assert.equal(shouldScanSubnet, true);
        return '192.168.1.41';
      },
      discoverHost: async () => {
        throw new Error('discovery should not run');
      },
    });

    assert.deepEqual(resolved, { host: '192.168.1.41' });
  });

  it('discovers by device id when MAC lookup misses and there is no fallback host', async () => {
    const resolved = await resolveTuyaLocalHost({
      configuredMac: 'aa:bb:cc:dd:ee:ff',
      deviceId: DEVICE_ID,
      lookupIp: async () => undefined,
      discoverHost: async (deviceId) => {
        assert.equal(deviceId, DEVICE_ID);
        return { host: '192.168.1.50' };
      },
    });

    assert.deepEqual(resolved, { host: '192.168.1.50' });
  });

  it('falls back to the usual host when MAC lookup misses', async () => {
    const resolved = await resolveTuyaLocalHost({
      configuredMac: 'aa:bb:cc:dd:ee:ff',
      fallbackHost: '203.0.113.10',
      deviceId: DEVICE_ID,
      lookupIp: async () => undefined,
      discoverHost: async () => {
        throw new Error('discovery should not run when a fallback host exists');
      },
    });

    assert.deepEqual(resolved, { host: '203.0.113.10' });
  });

  it('uses the usual fallback host when neither IP nor MAC is set', async () => {
    const resolved = await resolveTuyaLocalHost({
      fallbackHost: '203.0.113.10',
      deviceId: DEVICE_ID,
      lookupIp: async () => {
        throw new Error('MAC lookup should not run');
      },
      discoverHost: async () => {
        throw new Error('discovery should not run when a fallback host exists');
      },
    });

    assert.deepEqual(resolved, { host: '203.0.113.10' });
  });

  it('discovers by device id when IP, MAC, and fallback host are all missing', async () => {
    const resolved = await resolveTuyaLocalHost({
      deviceId: DEVICE_ID,
      lookupIp: async () => {
        throw new Error('MAC lookup should not run');
      },
      discoverHost: async (deviceId) => {
        assert.equal(deviceId, DEVICE_ID);
        return { host: '192.168.1.50', discoveredVersion: '3.4' };
      },
    });

    assert.deepEqual(resolved, { host: '192.168.1.50', discoveredVersion: '3.4' });
  });
});
