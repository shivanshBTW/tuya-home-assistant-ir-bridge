import { discoverDevices } from '@apocaliss92/nodetuya';
import { TUYA_DISCOVERY_TIMEOUT_MS } from '../constants.js';
import { isLanIpv4 } from './lanAddress.js';
import { lookupIpByMac } from './lookupIpByMac.js';

export interface ResolvedLocalHost {
  host?: string;
  discoveredVersion?: string;
}

export const discoverHostByDeviceId = async (deviceId: string): Promise<ResolvedLocalHost> => {
  try {
    const discovered = await discoverDevices({ timeoutMs: TUYA_DISCOVERY_TIMEOUT_MS });
    const match = discovered.find((item) => item.id === deviceId);
    if (!match || !isLanIpv4(match.ip)) {
      return {};
    }
    return { host: match.ip, discoveredVersion: match.version };
  } catch (error) {
    console.warn(`LAN discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
};

export const resolveTuyaLocalHost = async ({
  configuredIp,
  configuredMac,
  fallbackHost,
  deviceId,
  lookupIp = lookupIpByMac,
  discoverHost = discoverHostByDeviceId,
  shouldScanSubnet = true,
}: {
  configuredIp?: string;
  configuredMac?: string;
  fallbackHost?: string;
  deviceId: string;
  lookupIp?: typeof lookupIpByMac;
  discoverHost?: typeof discoverHostByDeviceId;
  shouldScanSubnet?: boolean;
}): Promise<ResolvedLocalHost> => {
  if (configuredIp) {
    if (isLanIpv4(configuredIp)) {
      return { host: configuredIp };
    }
    console.warn(`Ignoring TUYA_LOCAL_IP ${configuredIp}; it is not a LAN address`);
  }

  if (configuredMac) {
    try {
      const hostFromMac = await lookupIp({ mac: configuredMac, shouldScanSubnet });
      if (hostFromMac) {
        console.log(`Resolved TUYA_LOCAL_MAC to ${hostFromMac}`);
        return { host: hostFromMac };
      }
      console.warn('No LAN IP found for TUYA_LOCAL_MAC; using discovery or a LAN catalog host');
    } catch (error) {
      console.warn(`MAC lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (fallbackHost && isLanIpv4(fallbackHost)) {
    return { host: fallbackHost };
  }
  if (fallbackHost) {
    console.warn(`Ignoring catalog host ${fallbackHost}; it is not a LAN address`);
  }

  if (!shouldScanSubnet) {
    return {};
  }

  return discoverHost(deviceId);
};
