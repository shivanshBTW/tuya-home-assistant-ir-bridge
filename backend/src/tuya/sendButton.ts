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

export const shouldPreferCloudSend = (button: CatalogButton): boolean => {
  return button.source === 'learned';
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

  const sendViaCloud = async (): Promise<SendResult> => {
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

  const sendViaLocal = async (): Promise<SendResult | undefined> => {
    const irCode = button.code;
    if (!irCode || !shouldSendCatalogButtonLocally(button) || !catalog.local.key) {
      return undefined;
    }
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
    if (!localDevice.host) {
      return undefined;
    }
    try {
      await sendLocalIrCode({ localDevice, code: irCode });
      console.log(`Local IR sent to ${localDevice.host} for ${button.keyName}`);
      return { path: SEND_PATH_LOCAL, buttonId: button.id, remoteId: remote.remoteId };
    } catch (error) {
      console.warn(
        `Local send failed, will try cloud if configured: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  };

  if (shouldPreferCloudSend(button) && cloudClient) {
    try {
      return await sendViaCloud();
    } catch (error) {
      console.warn(
        `Cloud send failed for ${button.keyName}, will try local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const localResult = await sendViaLocal();
  if (localResult) {
    return localResult;
  }

  return sendViaCloud();
};
