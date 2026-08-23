import { SEND_PATH_CLOUD, SEND_PATH_LOCAL } from '../constants.js';
import type { Catalog, CatalogButton, SendResult } from '../types.js';
import { sendCloudButton } from './cloudSend.js';
import type { TuyaCloudClient } from './cloudClient.js';
import { catalogCodeToLocalIrFrame, classifyCatalogIrCode } from './irFrame.js';
import { clearCachedLocalTarget, resolveLocalBlaster, sendLocalIrCode } from './localSend.js';

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
  return Boolean(button.code);
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
    const localDevice = await resolveLocalBlaster({
      localDevice: catalog.local,
      configuredIp,
      configuredMac,
    });
    if (!localDevice?.host) {
      return undefined;
    }
    try {
      await sendLocalIrCode({
        localDevice,
        frame: catalogCodeToLocalIrFrame(irCode),
      });
      console.log(
        `Local IR sent to ${localDevice.host} for ${button.keyName} (${classifyCatalogIrCode(irCode)})`,
      );
      return { path: SEND_PATH_LOCAL, buttonId: button.id, remoteId: remote.remoteId };
    } catch (error) {
      clearCachedLocalTarget();
      console.warn(
        `Local send failed, will try cloud if configured: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  };

  const localResult = await sendViaLocal();
  if (localResult) {
    return localResult;
  }

  return sendViaCloud();
};
