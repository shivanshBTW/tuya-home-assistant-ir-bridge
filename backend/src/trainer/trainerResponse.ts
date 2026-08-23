import type { TrainerFile, TrainerSample } from '../types.js';
import { listTrainerCapturePlan } from './trainerPlan.js';

export type TrainerPublicSample = Omit<TrainerSample, 'code'>;

export const toTrainerResponse = (trainer: TrainerFile) => {
  return {
    updatedAt: trainer.updatedAt,
    schema: trainer.schema,
    samples: trainer.samples.map(({ code: _code, ...sample }) => sample),
    inference: trainer.inference,
    capturePlan: listTrainerCapturePlan(trainer.schema),
  };
};
