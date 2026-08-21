import type { Catalog, CatalogRemote, LocalDevice } from '../types.js';
import type { TuyaCloudClient } from './cloudClient.js';
import { flattenButtonsFromIrPayloads, parseKeysResult } from './irPayload.js';
import {
  fetchDeviceDetail,
  fetchInfraredRemotes,
  lookupGatewayId,
  resolveInfraredHubId,
} from './remoteList.js';

export const exportCatalog = async ({
  cloudClient,
  infraredId: requestedInfraredId,
  localOverrides,
}: {
  cloudClient: TuyaCloudClient;
  infraredId: string;
  localOverrides: LocalDevice;
}): Promise<Catalog> => {
  let deviceDetail = await fetchDeviceDetail({ cloudClient, deviceId: requestedInfraredId });
  if (deviceDetail.sub && !deviceDetail.gateway_id && !deviceDetail.parent_id) {
    const gatewayId = await lookupGatewayId({
      cloudClient,
      deviceId: requestedInfraredId,
    });
    if (gatewayId) {
      deviceDetail = { ...deviceDetail, gateway_id: gatewayId };
    }
  }

  const infraredId = resolveInfraredHubId({
    requestedId: requestedInfraredId,
    deviceDetail,
  });
  if (infraredId !== requestedInfraredId) {
    console.warn(
      `TUYA_IR_DEVICE_ID is a virtual remote. Exporting parent IR hub ${infraredId} instead.`,
    );
    const hubDetail = await fetchDeviceDetail({ cloudClient, deviceId: infraredId });
    deviceDetail = {
      ...hubDetail,
      local_key: hubDetail.local_key ?? deviceDetail.local_key,
    };
  }

  console.log(`Found IR hub: ${infraredId}${deviceDetail.name ? ` (${deviceDetail.name})` : ''}`);

  const remoteList = await fetchInfraredRemotes({
    cloudClient,
    infraredId,
    uid: deviceDetail.uid,
    ownerId: deviceDetail.owner_id,
  });
  console.log(`Found ${remoteList.length} remotes`);

  const remotes: CatalogRemote[] = [];

  for (const [remoteListIndex, remoteItem] of remoteList.entries()) {
    const remoteId = String(remoteItem.remote_id ?? '');
    if (!remoteId) {
      continue;
    }

    const remoteName = remoteItem.remote_name ?? remoteId;
    console.log(`[${remoteListIndex + 1}/${remoteList.length}] ${remoteName}`);

    let keys: unknown = { key_list: [] };
    try {
      keys = await cloudClient.request<unknown>({
        method: 'GET',
        path: `/v2.0/infrareds/${infraredId}/remotes/${remoteId}/keys`,
      });
    } catch (error) {
      console.warn(`  keys unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }

    let learningCodes: unknown = [];
    try {
      learningCodes = await cloudClient.request<unknown>({
        method: 'GET',
        path: `/v2.0/infrareds/${infraredId}/remotes/${remoteId}/learning-codes`,
      });
    } catch (error) {
      console.warn(
        `  learned codes unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const keysResult = parseKeysResult(keys);
    const categoryId = remoteItem.category_id ?? keysResult.category_id;
    const brandId = remoteItem.brand_id ?? keysResult.brand_id;
    const remoteIndex = remoteItem.remote_index ?? keysResult.remote_index;

    let codeLibrary: unknown;
    if (categoryId !== undefined && brandId !== undefined && remoteIndex !== undefined) {
      try {
        codeLibrary = await cloudClient.request<unknown>({
          method: 'GET',
          path: `/v2.0/infrareds/${infraredId}/categories/${categoryId}/brands/${brandId}/remotes/${remoteIndex}/rules`,
        });
      } catch (error) {
        console.warn(
          `  code library unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
        codeLibrary = undefined;
      }
    }

    const buttons = flattenButtonsFromIrPayloads({
      remoteId,
      keys,
      learningCodes,
      codeLibrary,
    });
    const learnedCount = buttons.filter((button) => button.source === 'learned').length;
    const payloadCount = buttons.filter((button) => Boolean(button.code)).length;
    console.log(`  ${buttons.length} buttons`);
    console.log(`  ${learnedCount} learned codes`);
    console.log(`  ${payloadCount} raw IR payloads`);

    remotes.push({
      remoteId,
      remoteName: remoteItem.remote_name,
      categoryId,
      brandId,
      brandName: remoteItem.brand_name,
      remoteIndex,
      remote: remoteItem,
      keys,
      learningCodes,
      codeLibrary,
      buttons,
    });
  }

  const local: LocalDevice = {
    id: deviceDetail.id ?? infraredId,
    key: localOverrides.key ?? deviceDetail.local_key,
    host: localOverrides.host ?? deviceDetail.ip,
    mac: localOverrides.mac,
    version: localOverrides.version,
    irSendDp: localOverrides.irSendDp,
    dps: localOverrides.dps,
  };

  return {
    infraredId,
    exportedAt: new Date().toISOString(),
    local,
    remotes,
  };
};
