import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readLearnedCodeFromDps } from '../localStudy.js';

describe('readLearnedCodeFromDps', () => {
  it('reads DP 202 when it looks like an IR frame', () => {
    assert.equal(
      readLearnedCodeFromDps({ '201': '{"control":"study"}', '202': 'BB4LmVTniQ==' }),
      'BB4LmVTniQ==',
    );
  });

  it('ignores study mode strings on other DPs', () => {
    assert.equal(readLearnedCodeFromDps({ '1': 'study', '2': 'study' }), undefined);
  });
});
