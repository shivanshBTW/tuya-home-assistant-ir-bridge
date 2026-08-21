import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import {
  DEFAULT_HOST,
  DEFAULT_MQTT_DISCOVERY_PREFIX,
  DEFAULT_PORT,
  DEFAULT_TUYA_LOCAL_VERSION,
  PLACEHOLDER_API_TOKEN,
} from './constants.js';
import { formatMacAddress } from './tuya/macAddress.js';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(backendDir, '../..');

loadDotenv({ path: path.resolve(backendDir, '../.env') });
loadDotenv({ path: path.resolve(repoRoot, '.env') });

const PLACEHOLDER_SECRET_VALUES = new Set([
  PLACEHOLDER_API_TOKEN,
  'changeme',
  'your-secret-here',
  'TODO',
]);

const readEnv = (name: string): string | undefined => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value.trim();
};

export interface AppConfig {
  host: string;
  port: number;
  apiToken: string;
  dataDir: string;
  frontendDistDir: string;
  tuyaAccessId: string | undefined;
  tuyaAccessSecret: string | undefined;
  tuyaApiEndpoint: string | undefined;
  tuyaIrDeviceId: string | undefined;
  tuyaLocalIp: string | undefined;
  tuyaLocalMac: string | undefined;
  tuyaLocalKey: string | undefined;
  tuyaLocalVersion: string;
  mqttUrl: string | undefined;
  mqttUsername: string | undefined;
  mqttPassword: string | undefined;
  mqttDiscoveryPrefix: string;
}

export const loadConfig = (): AppConfig => {
  const apiToken = readEnv('API_TOKEN') ?? PLACEHOLDER_API_TOKEN;
  if (PLACEHOLDER_SECRET_VALUES.has(apiToken)) {
    throw new Error(
      'API_TOKEN is still the example placeholder. Copy backend/.env.example to backend/.env and set a long random token.',
    );
  }

  const tuyaAccessSecret = readEnv('TUYA_ACCESS_SECRET');
  if (tuyaAccessSecret && PLACEHOLDER_SECRET_VALUES.has(tuyaAccessSecret)) {
    throw new Error('TUYA_ACCESS_SECRET looks like a placeholder. Refusing to start.');
  }

  return {
    host: readEnv('HOST') ?? DEFAULT_HOST,
    port: Number(readEnv('PORT') ?? DEFAULT_PORT),
    apiToken,
    dataDir: path.resolve(repoRoot, readEnv('DATA_DIR') ?? 'data'),
    frontendDistDir: path.resolve(repoRoot, 'frontend/dist'),
    tuyaAccessId: readEnv('TUYA_ACCESS_ID'),
    tuyaAccessSecret,
    tuyaApiEndpoint: readEnv('TUYA_API_ENDPOINT'),
    tuyaIrDeviceId: readEnv('TUYA_IR_DEVICE_ID'),
    tuyaLocalIp: readEnv('TUYA_LOCAL_IP'),
    tuyaLocalMac: readMacEnv('TUYA_LOCAL_MAC'),
    tuyaLocalKey: readEnv('TUYA_LOCAL_KEY'),
    tuyaLocalVersion: readEnv('TUYA_LOCAL_VERSION') ?? DEFAULT_TUYA_LOCAL_VERSION,
    mqttUrl: readEnv('MQTT_URL'),
    mqttUsername: readEnv('MQTT_USERNAME'),
    mqttPassword: readEnv('MQTT_PASSWORD'),
    mqttDiscoveryPrefix: readEnv('MQTT_DISCOVERY_PREFIX') ?? DEFAULT_MQTT_DISCOVERY_PREFIX,
  };
};

export const requireTuyaCloudConfig = (appConfig: AppConfig) => {
  return {
    accessId: readRequiredFrom(appConfig.tuyaAccessId, 'TUYA_ACCESS_ID'),
    accessSecret: readRequiredFrom(appConfig.tuyaAccessSecret, 'TUYA_ACCESS_SECRET'),
    apiEndpoint: readRequiredFrom(appConfig.tuyaApiEndpoint, 'TUYA_API_ENDPOINT'),
    irDeviceId: readRequiredFrom(appConfig.tuyaIrDeviceId, 'TUYA_IR_DEVICE_ID'),
  };
};

const readRequiredFrom = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

const readMacEnv = (name: string): string | undefined => {
  const value = readEnv(name);
  if (!value) {
    return undefined;
  }
  return formatMacAddress(value);
};
