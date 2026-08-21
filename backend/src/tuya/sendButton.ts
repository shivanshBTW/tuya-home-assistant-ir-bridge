import { SEND_PATH_CLOUD, SEND_PATH_LOCAL } from '../constants.js';
import type { Catalog, CatalogButton, SendResult } from '../types.js';
import { sendCloudButton } from './cloudSend.js';
import type { TuyaCloudClient } from './cloudClient.js';
import { sendLocalIrCode } from './localSend.js';

const findButton = (catalog: Catalog, buttonId: string): CatalogButton => {
  for (const remote of catalog.remotes) {
    const button = remote.buttons.find((item) => item.id === buttonId);
    if (button) {
      return button;
    }
  }
  throw new Error(`Unknown button ${buttonId}`);
};

export const sendCatalogButton = async ({
  catalog,
  buttonId,
  cloudClient,
}: {
  catalog: Catalog;
  buttonId: string;
  cloudClient?: TuyaCloudClient;
}): Promise<SendResult> => {
  const button = findButton(catalog, buttonId);
  const remote = catalog.remotes.find((item) => item.remoteId === button.remoteId);
  if (!remote) {
    throw new Error(`Unknown remote ${button.remoteId}`);
  }

  if (button.code && catalog.local.key && catalog.local.host) {
    try {
      await sendLocalIrCode({ localDevice: catalog.local, code: button.code });
      return { path: SEND_PATH_LOCAL, buttonId: button.id, remoteId: remote.remoteId };
    } catch (error) {
      console.warn(
        `Local send failed, will try cloud if configured: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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
