import { TuyaDevice, discoverDevices } from '@apocaliss92/nodetuya';
import { DEFAULT_IR_SEND_DP } from '../constants.js';
import type { LocalDevice } from '../types.js';

const DISCOVERY_TIMEOUT_MS = 4000;

export const probeLocalDevice = async (localDevice: LocalDevice): Promise<LocalDevice> => {
  if (!localDevice.key) {
    return localDevice;
  }

  let host = localDevice.host;
  let version = localDevice.version;

  if (!host) {
    try {
      const discovered = await discoverDevices({ timeoutMs: DISCOVERY_TIMEOUT_MS });
      const match = discovered.find((item) => item.id === localDevice.id);
      if (match) {
        host = match.ip ?? host;
        version = match.version ?? version;
      }
    } catch (error) {
      console.warn(
        `LAN discovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!host) {
    return { ...localDevice, host, version };
  }

  const device = new TuyaDevice({
    id: localDevice.id,
    key: localDevice.key,
    host,
    version: version ?? '3.3',
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
      host,
      version,
      irSendDp,
      dps,
    };
  } catch (error) {
    console.warn(`LAN probe failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ...localDevice, host, version };
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
