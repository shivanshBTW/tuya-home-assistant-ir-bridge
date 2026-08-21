import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseRemoteList,
  resolveInfraredHubId,
  shouldIncludeAccountDeviceAsRemote,
} from '../remoteList.js';

describe('parseRemoteList', () => {
  it('reads a top-level array of remotes', () => {
    const remotes = parseRemoteList([
      { remote_id: 'r1', remote_name: 'Fan' },
      { remote_id: 'r2', remote_name: 'TV' },
    ]);
    assert.deepEqual(remotes, [
      {
        remote_id: 'r1',
        remote_name: 'Fan',
        category_id: undefined,
        brand_id: undefined,
        brand_name: undefined,
        remote_index: undefined,
      },
      {
        remote_id: 'r2',
        remote_name: 'TV',
        category_id: undefined,
        brand_id: undefined,
        brand_name: undefined,
        remote_index: undefined,
      },
    ]);
  });

  it('reads nested remote_list, remotes, and devices keys', () => {
    assert.equal(
      parseRemoteList({ remote_list: [{ remote_id: 'r1', remote_name: 'Fan' }] })[0]?.remote_id,
      'r1',
    );
    assert.equal(
      parseRemoteList({ remotes: [{ remote_id: 'r2', remote_name: 'TV' }] })[0]?.remote_id,
      'r2',
    );
    assert.equal(parseRemoteList({ devices: [{ id: 'r3', name: 'AC' }] })[0]?.remote_id, 'r3');
  });

  it('uses id when remote_id is missing', () => {
    const remotes = parseRemoteList([{ id: 'bf123', name: 'Bedroom fan' }]);
    assert.deepEqual(remotes[0]?.remote_id, 'bf123');
    assert.deepEqual(remotes[0]?.remote_name, 'Bedroom fan');
  });

  it('returns an empty list for unknown shapes', () => {
    assert.deepEqual(parseRemoteList(undefined), []);
    assert.deepEqual(parseRemoteList({ success: true }), []);
  });
});

describe('resolveInfraredHubId', () => {
  it('keeps the requested id for a physical hub', () => {
    assert.equal(
      resolveInfraredHubId({
        requestedId: 'hub-1',
        deviceDetail: { id: 'hub-1', sub: false },
      }),
      'hub-1',
    );
  });

  it('switches to the gateway when the configured id is a virtual remote', () => {
    assert.equal(
      resolveInfraredHubId({
        requestedId: 'virtual-tv',
        deviceDetail: { id: 'virtual-tv', sub: true, gateway_id: 'hub-1' },
      }),
      'hub-1',
    );
  });

  it('uses parent_id when gateway_id is missing', () => {
    assert.equal(
      resolveInfraredHubId({
        requestedId: 'virtual-tv',
        deviceDetail: { id: 'virtual-tv', sub: true, parent_id: 'hub-1' },
      }),
      'hub-1',
    );
  });
});

describe('shouldIncludeAccountDeviceAsRemote', () => {
  const infraredId = 'smart-ir';

  it('includes Smart Life infrared_* siblings of the hub', () => {
    assert.equal(
      shouldIncludeAccountDeviceAsRemote({
        infraredId,
        device: { id: 'fan', name: 'Bedroom Fan', category: 'infrared_fan' },
      }),
      true,
    );
    assert.equal(
      shouldIncludeAccountDeviceAsRemote({
        infraredId,
        device: { id: 'tv', name: 'Vu TV', category: 'infrared_tv' },
      }),
      true,
    );
    assert.equal(
      shouldIncludeAccountDeviceAsRemote({
        infraredId,
        device: { id: 'ac', name: 'LG AC', category: 'infrared_ac' },
      }),
      true,
    );
  });

  it('excludes the hub and non-IR Wi-Fi devices', () => {
    assert.equal(
      shouldIncludeAccountDeviceAsRemote({
        infraredId,
        device: { id: infraredId, name: 'Smart IR', category: 'qt' },
      }),
      false,
    );
    assert.equal(
      shouldIncludeAccountDeviceAsRemote({
        infraredId,
        device: { id: 'switch', name: '4 Touch switch', category: 'kg' },
      }),
      false,
    );
    assert.equal(
      shouldIncludeAccountDeviceAsRemote({
        infraredId,
        device: { id: 'heater', name: 'Heater', category: 'qn' },
      }),
      false,
    );
  });
});
