import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flattenButtonsFromIrPayloads,
  parseCodeLibraryRules,
  parseKeysResult,
  parseLearnedCodes,
} from '../irPayload.js';

describe('parseKeysResult', () => {
  it('keeps category metadata and key_list', () => {
    const keys = parseKeysResult({
      category_id: 8,
      brand_id: 22,
      remote_index: 101,
      key_list: [{ key: 'power', key_name: 'Power' }],
    });
    assert.equal(keys.category_id, 8);
    assert.equal(keys.brand_id, 22);
    assert.equal(keys.remote_index, 101);
    assert.equal(keys.key_list?.[0]?.key, 'power');
  });
});

describe('parseLearnedCodes', () => {
  it('reads a nested learning-codes list', () => {
    const learned = parseLearnedCodes({
      result: [{ key: 'power', code: 'aa11', key_name: 'Power' }],
    });
    assert.equal(learned[0]?.code, 'aa11');
  });
});

describe('parseCodeLibraryRules', () => {
  it('reads library rules that include IR codes', () => {
    const rules = parseCodeLibraryRules([
      { key: 'power', key_name: 'Power', code: 'BB4LmVTniQ==' },
    ]);
    assert.equal(rules[0]?.code, 'BB4LmVTniQ==');
  });
});

describe('flattenButtonsFromIrPayloads', () => {
  it('copies library codes onto matching key-name buttons', () => {
    const buttons = flattenButtonsFromIrPayloads({
      remoteId: 'fan',
      keys: { key_list: [{ key: 'power', key_name: 'Power' }] },
      learningCodes: [],
      codeLibrary: [{ key: 'power', code: 'BB4LmVTniQ==' }],
    });
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0]?.code, 'BB4LmVTniQ==');
  });

  it('keeps learned codes as their own buttons when keys have no payload', () => {
    const buttons = flattenButtonsFromIrPayloads({
      remoteId: 'ac',
      keys: { key_list: [] },
      learningCodes: [{ key: 'cool', key_name: 'Cool', code: 'c42230', learn_id: 1 }],
    });
    assert.equal(buttons[0]?.source, 'learned');
    assert.equal(buttons[0]?.code, 'c42230');
  });
});
