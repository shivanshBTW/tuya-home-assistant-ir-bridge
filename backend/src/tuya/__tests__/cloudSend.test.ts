import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogButton, CatalogRemote } from '../../types.js';
import { listCloudSendAttempts } from '../cloudSend.js';

const remote: CatalogRemote = {
  remoteId: 'tv-remote',
  categoryId: 2,
  remoteIndex: 101,
  remote: {},
  keys: {},
  learningCodes: [],
  buttons: [],
};

const button = (overrides: Partial<CatalogButton>): CatalogButton => ({
  id: 'tv-remote:key:sleep:22',
  remoteId: 'tv-remote',
  key: 'sleep',
  keyName: '睡眠',
  source: 'key',
  raw: { key: 'sleep', key_id: 22, standard_key: false },
  ...overrides,
});

describe('listCloudSendAttempts', () => {
  it('sends non-standard keys through raw/command before the standard API', () => {
    const attempts = listCloudSendAttempts({
      infraredId: 'hub',
      remote,
      button: button({}),
    });
    assert.deepEqual(
      attempts.map((attempt) => attempt.label),
      ['raw-command', 'standard-command'],
    );
    assert.equal(attempts[0]?.path, '/v2.0/infrareds/hub/remotes/tv-remote/raw/command');
    assert.deepEqual(attempts[0]?.body, {
      category_id: 2,
      key: 'sleep',
      key_id: 22,
    });
  });

  it('sends standard keys through /command first', () => {
    const attempts = listCloudSendAttempts({
      infraredId: 'hub',
      remote,
      button: button({
        key: 'power',
        keyName: 'POWER',
        id: 'tv-remote:key:power:1',
        raw: { key: 'power', key_id: 1, standard_key: true },
      }),
    });
    assert.equal(attempts[0]?.label, 'standard-command');
    assert.equal(attempts[1]?.label, 'raw-command');
  });

  it('falls back to raw/command when Tuya did not mark the key as standard', () => {
    const attempts = listCloudSendAttempts({
      infraredId: 'hub',
      remote,
      button: button({
        raw: { key: 'sleep', key_id: 22 },
      }),
    });
    assert.deepEqual(
      attempts.map((attempt) => attempt.label),
      ['standard-command', 'raw-command'],
    );
  });

  it('sends AC library keys through scenes/command, not remotes/command', () => {
    const attempts = listCloudSendAttempts({
      infraredId: 'hub',
      remote: { ...remote, categoryId: 5, remoteIndex: 3482, remoteId: 'bedroom-ac' },
      button: button({
        id: 'bedroom-ac:library:M0_T28_S1:0',
        remoteId: 'bedroom-ac',
        key: 'M0_T28_S1',
        keyName: 'M0_T28_S1',
        code: 'aabb',
        raw: { key: 'M0_T28_S1', key_id: 0 },
      }),
    });
    assert.deepEqual(
      attempts.map((attempt) => attempt.label),
      ['ac-scene-command', 'learning-codes'],
    );
    assert.equal(
      attempts[0]?.path,
      '/v2.0/infrareds/hub/air-conditioners/bedroom-ac/scenes/command',
    );
    assert.deepEqual(attempts[0]?.body, {
      category_id: 5,
      remote_index: 3482,
      power: 1,
      mode: 0,
      temp: 28,
      wind: 1,
    });
  });

  it('sends learned codes first, then falls back to key APIs', () => {
    const attempts = listCloudSendAttempts({
      infraredId: 'hub',
      remote,
      button: button({
        source: 'learned',
        code: 'abc123',
        id: 'tv-remote:learned:9',
        raw: { learn_id: 9 },
      }),
    });
    assert.deepEqual(
      attempts.map((attempt) => attempt.label),
      ['learning-codes', 'standard-command', 'raw-command'],
    );
  });
});
