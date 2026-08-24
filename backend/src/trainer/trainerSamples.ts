import type { TrainerFile, TrainerSample } from '../types.js';
import { trainerStepId } from './trainerPlan.js';

const sampleStepId = (sample: TrainerSample): string => {
  return trainerStepId({
    kind: sample.probeIndex === undefined ? 'cycle' : 'probe',
    unlockedParamId: sample.unlockedParamId,
    paramValues: sample.paramValues,
    probeParamId: sample.probeParamId,
    probeIndex: sample.probeIndex,
  });
};

export const upsertTrainerSample = ({
  trainer,
  sample,
}: {
  trainer: TrainerFile;
  sample: TrainerSample;
}): TrainerFile => {
  const nextStepId = sampleStepId(sample);
  return {
    ...trainer,
    samples: [...trainer.samples.filter((item) => sampleStepId(item) !== nextStepId), sample],
  };
};
