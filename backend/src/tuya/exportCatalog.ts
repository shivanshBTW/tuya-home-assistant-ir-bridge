import type { Catalog, CatalogButton, CatalogRemote, LocalDevice } from '../types.js';
import type { TuyaCloudClient } from './cloudClient.js';
import {
  fetchDeviceDetail,
  fetchInfraredRemotes,
  lookupGatewayId,
  resolveInfraredHubId,
} from './remoteList.js';

interface TuyaKeyItem {
  key?: string;
  key_name?: string;
  key_id?: number | string;
  code?: string;
}

interface TuyaKeysResult {
  key_list?: TuyaKeyItem[];
  category_id?: number;
  brand_id?: number;
  remote_index?: number;
}

interface TuyaLearnedCode {
  id?: string | number;
  learn_id?: string | number;
  key?: string;
  key_name?: string;
  code?: string;
  remote_id?: string;
}

const flattenButtons = ({
  remoteId,
  keys,
  learningCodes,
}: {
  remoteId: string;
  keys: unknown;
  learningCodes: unknown;
}): CatalogButton[] => {
  const buttons: CatalogButton[] = [];
  const keysResult = (keys ?? {}) as TuyaKeysResult;
  const keyList = Array.isArray(keysResult.key_list) ? keysResult.key_list : [];

  for (const [keyIndex, keyItem] of keyList.entries()) {
    const key = String(keyItem.key ?? `key_${keyIndex}`);
    buttons.push({
      id: `${remoteId}:key:${key}:${keyItem.key_id ?? keyIndex}`,
      remoteId,
      key,
      keyName: String(keyItem.key_name ?? key),
      code: typeof keyItem.code === 'string' ? keyItem.code : undefined,
      source: 'key',
      raw: keyItem,
    });
  }

  const learnedList = Array.isArray(learningCodes) ? (learningCodes as TuyaLearnedCode[]) : [];
  for (const [learnedIndex, learned] of learnedList.entries()) {
    const key = String(learned.key ?? `learned_${learnedIndex}`);
    buttons.push({
      id: `${remoteId}:learned:${learned.learn_id ?? learned.id ?? learnedIndex}`,
      remoteId,
      key,
      keyName: String(learned.key_name ?? key),
      code: typeof learned.code === 'string' ? learned.code : undefined,
      source: 'learned',
      raw: learned,
    });
  }

  return buttons;
};

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

  for (const [remoteIndex, remoteItem] of remoteList.entries()) {
    const remoteId = String(remoteItem.remote_id ?? '');
    if (!remoteId) {
      continue;
    }

    const remoteName = remoteItem.remote_name ?? remoteId;
    console.log(`[${remoteIndex + 1}/${remoteList.length}] ${remoteName}`);

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

    let codeLibrary: unknown;
    if (
      remoteItem.category_id !== undefined &&
      remoteItem.brand_id !== undefined &&
      remoteItem.remote_index !== undefined
    ) {
      try {
        codeLibrary = await cloudClient.request<unknown>({
          method: 'GET',
          path: `/v2.0/infrareds/${infraredId}/categories/${remoteItem.category_id}/brands/${remoteItem.brand_id}/remotes/${remoteItem.remote_index}/rules`,
        });
      } catch {
        codeLibrary = undefined;
      }
    }

    const buttons = flattenButtons({ remoteId, keys, learningCodes });
    const learnedCount = buttons.filter((button) => button.source === 'learned').length;
    console.log(`  ${buttons.length} buttons`);
    console.log(`  ${learnedCount} learned codes`);

    remotes.push({
      remoteId,
      remoteName: remoteItem.remote_name,
      categoryId: remoteItem.category_id,
      brandId: remoteItem.brand_id,
      brandName: remoteItem.brand_name,
      remoteIndex: remoteItem.remote_index,
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
