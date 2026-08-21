import { TuyaDevice } from '@apocaliss92/nodetuya';
import { DEFAULT_IR_SEND_DP } from '../constants.js';
import type { LocalDevice } from '../types.js';
import { resolveTuyaLocalHost } from './resolveLocalHost.js';

export const prepareLocalDevice = async ({
  localDevice,
  configuredIp,
  configuredMac,
}: {
  localDevice: LocalDevice;
  configuredIp?: string;
  configuredMac?: string;
}): Promise<LocalDevice> => {
  const resolved = await resolveTuyaLocalHost({
    configuredIp,
    configuredMac,
    fallbackHost: localDevice.host,
    deviceId: localDevice.id,
  });

  return probeLocalDevice({
    ...localDevice,
    host: resolved.host,
    version: resolved.discoveredVersion ?? localDevice.version,
    mac: configuredIp ? undefined : configuredMac,
  });
};

export const probeLocalDevice = async (localDevice: LocalDevice): Promise<LocalDevice> => {
  if (!localDevice.key || !localDevice.host) {
    return localDevice;
  }

  const device = new TuyaDevice({
    id: localDevice.id,
    key: localDevice.key,
    host: localDevice.host,
    version: localDevice.version ?? '3.3',
  });

  try {
    await device.connect();
    const dps = (await device.get()) as Record<string, unknown>;
    const irSendDp =
      localDevice.irSendDp ??
      (Object.prototype.hasOwnProperty.call(dps, DEFAULT_IR_SEND_DP)
        ? DEFAULT_IR_SEND_DP
        : Object.keys(dps).find((dp) => dp === '201' || dp === '3'));

    return {
      ...localDevice,
      irSendDp,
      dps,
    };
  } catch (error) {
    console.warn(`LAN probe failed: ${error instanceof Error ? error.message : String(error)}`);
    return localDevice;
  } finally {
    try {
      device.disconnect();
    } catch {
      // Device may already be closed.
    }
  }
};

export const sendLocalIrCode = async ({
  localDevice,
  code,
}: {
  localDevice: LocalDevice;
  code: string;
}): Promise<void> => {
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

  const payload = JSON.stringify({
    control: 'send_ir',
    head: '',
    key1: `1${code}`,
    type: 0,
    delay: 300,
  });

  try {
    await device.connect();
    await device.set({ [irSendDp]: payload });
  } finally {
    try {
      device.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }
};
