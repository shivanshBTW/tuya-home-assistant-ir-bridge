import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TRAINER_PARAM_TEMP,
  createDefaultAcTrainerSchema,
  listAllowedOptionIds,
  listTrainerCapturePlan,
} from '../trainerPlan.js';

describe('listTrainerCapturePlan', () => {
  it('omits temp from the fan_only cycle and lists leftover probes', () => {
    const schema = createDefaultAcTrainerSchema();
    const plan = listTrainerCapturePlan(schema);
    const tempCycleOptionIds = plan
      .filter((step) => step.kind === 'cycle' && step.unlockedParamId === TRAINER_PARAM_TEMP)
      .map((step) => step.paramValues[TRAINER_PARAM_TEMP]);
    assert.deepEqual(tempCycleOptionIds, ['16', '17', '23', '24', '30']);
    assert.equal(
      plan.some(
        (step) =>
          step.kind === 'cycle' &&
          step.unlockedParamId === TRAINER_PARAM_TEMP &&
          step.paramValues.mode === 'fan_only',
      ),
      false,
    );
    assert.equal(
      listAllowedOptionIds({
        schema,
        paramId: TRAINER_PARAM_TEMP,
        primaryOptionId: 'fan_only',
      }).length,
      0,
    );
    const fanTempProbes = plan.filter(
      (step) =>
        step.kind === 'probe' &&
        step.paramValues.mode === 'fan_only' &&
        step.probeParamId === TRAINER_PARAM_TEMP,
    );
    assert.equal(fanTempProbes.length, 2);
    assert.equal(fanTempProbes[0]?.paramValues[TRAINER_PARAM_TEMP], undefined);
  });
});
