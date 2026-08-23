import type { TrainerFile, TrainerSample } from '../types.js';
import { generateTrainerGrid } from './trainerGenerate.js';
import { inferTrainerFields } from './trainerInfer.js';
import { listTrainerCapturePlan } from './trainerPlan.js';

export type TrainerPublicSample = Omit<TrainerSample, 'code'>;

export const toTrainerResponse = (trainer: TrainerFile) => {
  const inference = inferTrainerFields(trainer);
  return {
    updatedAt: trainer.updatedAt,
    schema: trainer.schema,
    samples: trainer.samples.map(({ code: _code, ...sample }) => sample),
    inference,
    generation: generateTrainerGrid({ ...trainer, inference }),
    capturePlan: listTrainerCapturePlan(trainer.schema),
  };
};
