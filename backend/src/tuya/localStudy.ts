import { TuyaDevice } from '@apocaliss92/nodetuya';
import {
  DEFAULT_IR_LEARN_DP,
  DEFAULT_IR_SEND_DP,
  STUDY_LISTEN_TIMEOUT_MS,
} from '../constants.js';
import type { LocalDevice } from '../types.js';

const LEARNED_DP_IDS = [DEFAULT_IR_LEARN_DP, '2', '13'] as const;
const STUDY_COMMAND = JSON.stringify({ control: 'study' });
const STUDY_EXIT_COMMAND = JSON.stringify({ control: 'study_exit' });
const POLL_INTERVAL_MS = 400;

const isLikelyIrCode = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return false;
  }
  return trimmed !== 'study' && trimmed !== 'study_exit' && trimmed !== 'send_ir';
};

export const readLearnedCodeFromDps = (dps: Record<string, unknown>): string | undefined => {
  for (const dp of LEARNED_DP_IDS) {
    const value = dps[dp];
    if (typeof value === 'string' && isLikelyIrCode(value)) {
      return value.trim();
    }
  }
  return undefined;
};

const setStudyControl = async ({
  device,
  irSendDp,
  payload,
}: {
  device: TuyaDevice;
  irSendDp: string;
  payload: string;
}): Promise<void> => {
  await device.set({ [irSendDp]: payload });
};

export const listenForLocalIrCode = async ({
  localDevice,
  timeoutMs = STUDY_LISTEN_TIMEOUT_MS,
}: {
  localDevice: LocalDevice;
  timeoutMs?: number;
}): Promise<string> => {
  if (!localDevice.key || !localDevice.host) {
    throw new Error('Local Tuya host or key is missing');
  }

  const irSendDp = localDevice.irSendDp ?? DEFAULT_IR_SEND_DP;
  const device = new TuyaDevice({
    id: localDevice.id,
    key: localDevice.key,
    host: localDevice.host,
    version: localDevice.version ?? '3.3',
  });

  let isSettled = false;
  const waitForCode = new Promise<string>((resolve, reject) => {
    const onDps = (dps: Record<string, unknown>) => {
      const code = readLearnedCodeFromDps(dps);
      if (!code || isSettled) {
        return;
      }
      isSettled = true;
      resolve(code);
    };
    device.on('dps', onDps);
    device.on('error', (error) => {
      if (!isSettled) {
        isSettled = true;
        reject(error);
      }
    });
  });

  try {
    await device.connect();
    await setStudyControl({ device, irSendDp, payload: STUDY_COMMAND });
    console.log(`Study mode armed on ${localDevice.host}`);

    const deadline = Date.now() + timeoutMs;
    const poll = async (): Promise<string> => {
      while (Date.now() < deadline && !isSettled) {
        try {
          const dps = await device.get();
          const code = readLearnedCodeFromDps(dps);
          if (code) {
            isSettled = true;
            return code;
          }
        } catch {
          // Keep waiting on pushes if a poll fails.
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, POLL_INTERVAL_MS);
        });
      }
      if (!isSettled) {
        isSettled = true;
        throw new Error('No IR received before study timeout');
      }
      return waitForCode;
    };

    return await Promise.race([waitForCode, poll()]);
  } finally {
    try {
      await setStudyControl({ device, irSendDp, payload: STUDY_EXIT_COMMAND });
    } catch {
      // Device may already be closed.
    }
    try {
      device.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }
};
