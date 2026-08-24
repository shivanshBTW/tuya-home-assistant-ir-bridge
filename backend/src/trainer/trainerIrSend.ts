import type { LocalDevice, TrainerFile } from '../types.js';
import {
  bitsToPulses,
  decodeIrCode,
  parseIrBitString,
  pulsesToHex,
  writeBitsIntoTemplatePulses,
} from '../tuya/irDecode.js';
import { catalogCodeToLocalIrFrame } from '../tuya/irFrame.js';
import { sendLocalIrCode } from '../tuya/localSend.js';
import { listMajorityLayoutSamples } from './trainerInfer.js';
import { TRAINER_PARAM_POWER, TRAINER_PARAM_POWER_SAVING } from './trainerPlan.js';

const MIN_USABLE_IR_PULSE_COUNT = 16;

const isUsableIrCode = (code: string | undefined): boolean => {
  if (!code) {
    return false;
  }
  return decodeIrCode(code).pulses.length >= MIN_USABLE_IR_PULSE_COUNT;
};

const originalCodeForBits = ({
  trainer,
  bits,
}: {
  trainer: TrainerFile;
  bits: string;
}): string | undefined => {
  const compactBits = parseIrBitString(bits);
  return trainer.samples.find(
    (sample) => sample.bits === compactBits && isUsableIrCode(sample.code),
  )?.code;
};

const climateTemplateCode = ({
  trainer,
  bits,
}: {
  trainer: TrainerFile;
  bits: string;
}): string | undefined => {
  const compactBits = parseIrBitString(bits);
  const majoritySamples = listMajorityLayoutSamples({
    schema: trainer.schema,
    samples: trainer.samples,
  });
  const matchingLength = majoritySamples.find(
    (sample) => isUsableIrCode(sample.code) && sample.bits.length === compactBits.length,
  );
  if (matchingLength?.code) {
    return matchingLength.code;
  }
  return trainer.samples.find(
    (sample) =>
      isUsableIrCode(sample.code) &&
      sample.unlockedParamId !== TRAINER_PARAM_POWER &&
      sample.unlockedParamId !== TRAINER_PARAM_POWER_SAVING,
  )?.code;
};

export const trainerPulsesForSend = ({
  bits,
  trainer,
}: {
  bits: string;
  trainer?: TrainerFile;
}): { originalCode?: string; pulses: number[] } => {
  const compactBits = parseIrBitString(bits);
  const originalCode = trainer ? originalCodeForBits({ trainer, bits: compactBits }) : undefined;
  if (originalCode) {
    return { originalCode, pulses: decodeIrCode(originalCode).pulses };
  }
  const templateCode = trainer ? climateTemplateCode({ trainer, bits: compactBits }) : undefined;
  if (templateCode) {
    return {
      pulses: writeBitsIntoTemplatePulses({
        bits: compactBits,
        templatePulses: decodeIrCode(templateCode).pulses,
      }),
    };
  }
  return { pulses: bitsToPulses(compactBits) };
};

export const sendTrainerIrBits = async ({
  bits,
  localDevice,
  trainer,
}: {
  bits: string;
  localDevice: LocalDevice;
  trainer?: TrainerFile;
}): Promise<{ bitCount: number; pulseCount: number }> => {
  const compactBits = parseIrBitString(bits);
  const { originalCode, pulses } = trainerPulsesForSend({ bits: compactBits, trainer });
  await sendLocalIrCode({
    localDevice,
    frame: catalogCodeToLocalIrFrame(originalCode ?? pulsesToHex(pulses)),
  });
  return {
    bitCount: compactBits.length,
    pulseCount: pulses.length,
  };
};
