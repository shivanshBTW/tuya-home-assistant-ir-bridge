import type { Catalog, CatalogButton, CatalogRemote, LocalDevice } from '../types.js';
import type { TuyaCloudClient } from './cloudClient.js';

interface TuyaRemoteListItem {
  remote_id?: string;
  remote_name?: string;
  category_id?: number;
  brand_id?: number;
  brand_name?: string;
  remote_index?: number;
}

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

interface TuyaDeviceDetail {
  id?: string;
  local_key?: string;
  ip?: string;
  product_id?: string;
  model?: string;
}

const asRemoteList = (value: unknown): TuyaRemoteListItem[] => {
  if (Array.isArray(value)) {
    return value as TuyaRemoteListItem[];
  }
  return [];
};

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
  infraredId,
  localOverrides,
}: {
  cloudClient: TuyaCloudClient;
  infraredId: string;
  localOverrides: LocalDevice;
}): Promise<Catalog> => {
  const remotesRaw = await cloudClient.request<unknown>({
    method: 'GET',
    path: `/v2.0/infrareds/${infraredId}/remotes`,
  });
  const remoteList = asRemoteList(remotesRaw);

  console.log(`Found IR hub: ${infraredId}`);
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

  let deviceDetail: TuyaDeviceDetail = {};
  try {
    deviceDetail = await cloudClient.request<TuyaDeviceDetail>({
      method: 'GET',
      path: `/v1.0/devices/${infraredId}`,
    });
  } catch (error) {
    console.warn(
      `Device detail unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
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
