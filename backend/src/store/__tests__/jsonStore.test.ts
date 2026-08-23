import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createDefaultAcTrainerSchema } from '../../trainer/trainerPlan.js';
import { JsonStore } from '../jsonStore.js';

describe('JsonStore study file', () => {
  it('returns an empty study when the file is missing', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'study-store-'));
    try {
      const store = new JsonStore(dataDir);
      const study = await store.readStudy();
      assert.deepEqual(study.log, []);
      assert.deepEqual(study.savedButtons, []);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('round-trips a named capture', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'study-store-'));
    try {
      const store = new JsonStore(dataDir);
      await store.writeStudy({
        updatedAt: '2026-01-01T00:00:00.000Z',
        log: [
          {
            id: 'cap-1',
            receivedAt: '2026-01-01T00:00:00.000Z',
            code: 'BB4LmVTniQ==',
            kind: 'lan_base64',
            pulseCount: 4,
          },
        ],
        savedButtons: [{ id: 'btn-1', captureId: 'cap-1', label: 'cool 24 low' }],
      });
      const study = await store.readStudy();
      assert.equal(study.log[0]?.id, 'cap-1');
      assert.equal(study.savedButtons[0]?.label, 'cool 24 low');
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe('JsonStore trainer file', () => {
  it('returns the default AC schema when the file is missing', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'trainer-store-'));
    try {
      const store = new JsonStore(dataDir);
      const trainer = await store.readTrainer();
      assert.equal(trainer.schema.primaryParamId, createDefaultAcTrainerSchema().primaryParamId);
      assert.deepEqual(trainer.samples, []);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
