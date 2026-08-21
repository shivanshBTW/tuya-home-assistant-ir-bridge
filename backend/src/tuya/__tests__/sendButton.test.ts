import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogButton } from '../../types.js';
import { shouldSendCatalogButtonLocally } from '../sendButton.js';

const button = (overrides: Partial<CatalogButton>): CatalogButton => ({
  id: 'remote:key:power:1',
  remoteId: 'remote',
  key: 'power',
  keyName: 'power',
  source: 'key',
  raw: {},
  ...overrides,
});

describe('shouldSendCatalogButtonLocally', () => {
  it('sends learned codes on the LAN', () => {
    assert.equal(
      shouldSendCatalogButtonLocally(
        button({
          id: 'remote:learned:1',
          source: 'learned',
          code: 'c422',
        }),
      ),
      true,
    );
  });

  it('does not send Tuya library frames locally', () => {
    assert.equal(
      shouldSendCatalogButtonLocally(
        button({
          id: 'remote:library:M0_T23_S2:0',
          key: 'M0_T23_S2',
          code: '+kLibraryCode',
        }),
      ),
      false,
    );
  });
});
