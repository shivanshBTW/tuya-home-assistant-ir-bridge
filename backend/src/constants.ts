export const PLACEHOLDER_API_TOKEN = 'replace-with-a-long-random-token';

export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PORT = 8787;
export const DEFAULT_MQTT_DISCOVERY_PREFIX = 'homeassistant';
export const DEFAULT_TUYA_LOCAL_VERSION = '3.3';
export const DEFAULT_IR_SEND_DP = '201';
export const DEFAULT_IR_LEARN_DP = '202';
export const STUDY_LISTEN_TIMEOUT_MS = 25_000;
export const STUDY_ROUTE_TIMEOUT_MS = 35_000;
export const TUYA_DISCOVERY_TIMEOUT_MS = 4000;

export const RATE_LIMIT_DELAY_MS = 250;

export const SEND_PATH_LOCAL = 'local' as const;
export const SEND_PATH_CLOUD = 'cloud' as const;
