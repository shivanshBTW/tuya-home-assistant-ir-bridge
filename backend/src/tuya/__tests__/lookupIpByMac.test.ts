import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectIpv4Subnets, hostsInSubnet, prefixLengthFromNetmask } from '../lookupIpByMac.js';

describe('prefixLengthFromNetmask', () => {
  it('converts dotted netmasks to prefix length', () => {
    assert.equal(prefixLengthFromNetmask('255.255.255.0'), 24);
    assert.equal(prefixLengthFromNetmask('255.255.255.255'), 32);
    assert.equal(prefixLengthFromNetmask('255.255.0.0'), 16);
  });
});

describe('hostsInSubnet', () => {
  it('lists usable hosts in a /24 and skips the interface address', () => {
    const hosts = hostsInSubnet({ address: '192.168.1.10', prefixLength: 24 });
    assert.equal(hosts[0], '192.168.1.1');
    assert.equal(hosts.at(-1), '192.168.1.254');
    assert.equal(hosts.includes('192.168.1.10'), false);
    assert.equal(hosts.includes('192.168.1.0'), false);
    assert.equal(hosts.includes('192.168.1.255'), false);
    assert.equal(hosts.length, 253);
  });

  it('does not scan prefixes larger than /24', () => {
    assert.deepEqual(hostsInSubnet({ address: '10.0.0.1', prefixLength: 16 }), []);
  });
});

describe('collectIpv4Subnets', () => {
  it('skips internal and IPv6 addresses', () => {
    const subnets = collectIpv4Subnets({
      lo0: [
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '127.0.0.1/8',
        },
      ],
      en0: [
        {
          address: '192.168.1.10',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: 'aa:bb:cc:dd:ee:ff',
          internal: false,
          cidr: '192.168.1.10/24',
        },
        {
          address: 'fe80::1',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6',
          mac: 'aa:bb:cc:dd:ee:ff',
          internal: false,
          cidr: 'fe80::1/64',
          scopeid: 1,
        },
      ],
    });

    assert.deepEqual(subnets, [
      { address: '192.168.1.10', prefixLength: 24, broadcast: '192.168.1.255' },
    ]);
  });
});
