import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, requireTuyaCloudConfig } from '../config.js';
import { JsonStore } from '../store/jsonStore.js';
import { TuyaCloudClient } from '../tuya/cloudClient.js';
import { exportCatalog } from '../tuya/exportCatalog.js';
import { probeLocalDevice } from '../tuya/localSend.js';

const runExport = async () => {
  const appConfig = loadConfig();
  const tuyaConfig = requireTuyaCloudConfig(appConfig);
  await mkdir(appConfig.dataDir, { recursive: true });

  const cloudClient = new TuyaCloudClient({
    apiEndpoint: tuyaConfig.apiEndpoint,
    accessId: tuyaConfig.accessId,
    accessSecret: tuyaConfig.accessSecret,
  });

  let catalog = await exportCatalog({
    cloudClient,
    infraredId: tuyaConfig.irDeviceId,
    localOverrides: {
      id: tuyaConfig.irDeviceId,
      key: appConfig.tuyaLocalKey,
      host: appConfig.tuyaLocalIp,
      version: appConfig.tuyaLocalVersion,
    },
  });
  catalog = {
    ...catalog,
    local: await probeLocalDevice(catalog.local),
  };

  const jsonStore = new JsonStore(appConfig.dataDir);
  await jsonStore.writeCatalog(catalog);
  console.log(`Backup written to ${path.join(appConfig.dataDir, 'catalog.json')}`);
};

runExport().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
