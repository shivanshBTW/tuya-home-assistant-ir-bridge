import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRemoteList, resolveInfraredHubId } from '../remoteList.js';

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
});
