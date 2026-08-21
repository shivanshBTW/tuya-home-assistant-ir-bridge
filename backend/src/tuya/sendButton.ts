import { SEND_PATH_CLOUD, SEND_PATH_LOCAL } from '../constants.js';
import type { Catalog, CatalogButton, SendResult } from '../types.js';
import { sendCloudButton } from './cloudSend.js';
import type { TuyaCloudClient } from './cloudClient.js';
import { sendLocalIrCode } from './localSend.js';
import { resolveTuyaLocalHost } from './resolveLocalHost.js';

const findButton = (catalog: Catalog, buttonId: string): CatalogButton => {
  for (const remote of catalog.remotes) {
    const button = remote.buttons.find((item) => item.id === buttonId);
    if (button) {
      return button;
    }
  }
  throw new Error(`Unknown button ${buttonId}`);
};

export const shouldSendCatalogButtonLocally = (button: CatalogButton): boolean => {
  return Boolean(button.code) && !button.id.includes(':library:');
};

export const sendCatalogButton = async ({
  catalog,
  buttonId,
  cloudClient,
  configuredIp,
  configuredMac,
}: {
  catalog: Catalog;
  buttonId: string;
  cloudClient?: TuyaCloudClient;
  configuredIp?: string;
  configuredMac?: string;
}): Promise<SendResult> => {
  const button = findButton(catalog, buttonId);
  const remote = catalog.remotes.find((item) => item.remoteId === button.remoteId);
  if (!remote) {
    throw new Error(`Unknown remote ${button.remoteId}`);
  }

  const irCode = button.code;
  if (irCode && shouldSendCatalogButtonLocally(button) && catalog.local.key) {
    const resolved = await resolveTuyaLocalHost({
      configuredIp,
      configuredMac: configuredMac ?? catalog.local.mac,
      fallbackHost: catalog.local.host,
      deviceId: catalog.local.id,
      shouldScanSubnet: true,
    });
    const localDevice = {
      ...catalog.local,
      host: resolved.host,
      version: resolved.discoveredVersion ?? catalog.local.version,
    };

    if (localDevice.host) {
      try {
        await sendLocalIrCode({ localDevice, code: irCode });
        return { path: SEND_PATH_LOCAL, buttonId: button.id, remoteId: remote.remoteId };
      } catch (error) {
        console.warn(
          `Local send failed, will try cloud if configured: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  if (!cloudClient) {
    throw new Error(
      `No raw IR code for button ${button.keyName} and Tuya Cloud is not configured for fallback`,
    );
  }

  await sendCloudButton({
    cloudClient,
    infraredId: catalog.infraredId,
    remote,
    button,
  });
  return { path: SEND_PATH_CLOUD, buttonId: button.id, remoteId: remote.remoteId };
};
