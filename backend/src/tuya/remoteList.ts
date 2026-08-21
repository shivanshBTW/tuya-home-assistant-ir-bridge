import type { TuyaCloudClient } from './cloudClient.js';

export interface TuyaRemoteListItem {
  remote_id?: string;
  remote_name?: string;
  category_id?: number;
  brand_id?: number;
  brand_name?: string;
  remote_index?: number;
}

export interface TuyaDeviceDetail {
  id?: string;
  name?: string;
  local_key?: string;
  ip?: string;
  product_id?: string;
  product_name?: string;
  model?: string;
  category?: string;
  sub?: boolean;
  gateway_id?: string;
  parent_id?: string;
  uid?: string;
  owner_id?: string;
}

export interface TuyaAssociatedDevice {
  id?: string;
  name?: string;
  sub?: boolean;
  gateway_id?: string;
  category?: string;
}

const IR_HUB_CATEGORIES = new Set(['qt', 'wnykq']);

export const isInfraredRemoteCategory = (category: string | undefined): boolean => {
  if (!category) {
    return false;
  }
  return category === 'infrared' || category.startsWith('infrared_');
};

export const isInfraredHubCategory = (category: string | undefined): boolean => {
  return Boolean(category && IR_HUB_CATEGORIES.has(category));
};

interface TuyaAssociatedDevicesResult {
  devices?: TuyaAssociatedDevice[];
  has_more?: boolean;
  last_row_key?: string;
}

const REMOTE_LIST_KEYS = ['remote_list', 'remotes', 'list', 'devices'] as const;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const toRemoteItem = (value: unknown): TuyaRemoteListItem | undefined => {
  const item = asRecord(value);
  if (!item) {
    return undefined;
  }
  const remoteId = item.remote_id ?? item.id ?? item.device_id;
  if (remoteId === undefined || remoteId === null || String(remoteId) === '') {
    return undefined;
  }
  const categoryId = item.category_id;
  const brandId = item.brand_id;
  const remoteIndex = item.remote_index;
  return {
    remote_id: String(remoteId),
    remote_name: String(item.remote_name ?? item.name ?? remoteId),
    category_id: typeof categoryId === 'number' ? categoryId : undefined,
    brand_id: typeof brandId === 'number' ? brandId : undefined,
    brand_name: typeof item.brand_name === 'string' ? item.brand_name : undefined,
    remote_index: typeof remoteIndex === 'number' ? remoteIndex : undefined,
  };
};

export const describeUnknown = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  const record = asRecord(value);
  if (record) {
    return `object(${Object.keys(record).join(',')})`;
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
};

export const parseRemoteList = (value: unknown): TuyaRemoteListItem[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const remote = toRemoteItem(item);
      return remote ? [remote] : [];
    });
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  for (const key of REMOTE_LIST_KEYS) {
    const nested = record[key];
    if (nested !== undefined) {
      const parsed = parseRemoteList(nested);
      if (parsed.length > 0 || Array.isArray(nested)) {
        return parsed;
      }
    }
  }

  const nestedResult = record.result;
  if (nestedResult !== undefined) {
    return parseRemoteList(nestedResult);
  }

  return [];
};

export const resolveInfraredHubId = ({
  requestedId,
  deviceDetail,
}: {
  requestedId: string;
  deviceDetail: TuyaDeviceDetail;
}): string => {
  if (deviceDetail.sub && (deviceDetail.gateway_id || deviceDetail.parent_id)) {
    return deviceDetail.gateway_id ?? deviceDetail.parent_id ?? requestedId;
  }
  return deviceDetail.id ?? requestedId;
};

const toAssociatedDevice = (value: unknown): TuyaAssociatedDevice | undefined => {
  const item = asRecord(value);
  if (!item || item.id === undefined || item.id === null || String(item.id) === '') {
    return undefined;
  }
  const gatewayId =
    (typeof item.gateway_id === 'string' && item.gateway_id) ||
    (typeof item.parent_id === 'string' && item.parent_id) ||
    undefined;
  return {
    id: String(item.id),
    name: typeof item.name === 'string' ? item.name : undefined,
    sub: item.sub === true,
    gateway_id: gatewayId,
    category: typeof item.category === 'string' ? item.category : undefined,
  };
};

export const parseAssociatedDevices = (value: unknown): TuyaAssociatedDevice[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const device = toAssociatedDevice(item);
      return device ? [device] : [];
    });
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  if (record.devices !== undefined) {
    return parseAssociatedDevices(record.devices);
  }
  if (record.result !== undefined) {
    return parseAssociatedDevices(record.result);
  }
  if (record.list !== undefined) {
    return parseAssociatedDevices(record.list);
  }
  return [];
};

export const shouldIncludeAccountDeviceAsRemote = ({
  device,
  infraredId,
}: {
  device: TuyaAssociatedDevice;
  infraredId: string;
}): boolean => {
  if (!device.id || device.id === infraredId) {
    return false;
  }
  if (isInfraredHubCategory(device.category)) {
    return false;
  }
  if (device.gateway_id === infraredId) {
    return true;
  }
  return isInfraredRemoteCategory(device.category);
};

const mergeRemoteById = (remotes: TuyaRemoteListItem[]): TuyaRemoteListItem[] => {
  const remoteById: Record<string, TuyaRemoteListItem> = {};
  for (const remote of remotes) {
    const remoteId = remote.remote_id;
    if (!remoteId) {
      continue;
    }
    const existing = remoteById[remoteId];
    remoteById[remoteId] = {
      ...existing,
      ...remote,
      remote_name: remote.remote_name ?? existing?.remote_name,
    };
  }
  return Object.values(remoteById);
};

const requestOrUndefined = async <T>(
  cloudClient: TuyaCloudClient,
  input: {
    method: 'GET';
    path: string;
    query?: Record<string, unknown>;
  },
): Promise<T | undefined> => {
  try {
    return await cloudClient.request<T>(input);
  } catch (error) {
    console.warn(
      `${input.path} unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
};

const mergeAccountDevices = (devices: TuyaAssociatedDevice[]): TuyaAssociatedDevice[] => {
  const deviceById: Record<string, TuyaAssociatedDevice> = {};
  for (const device of devices) {
    if (!device.id) {
      continue;
    }
    deviceById[device.id] = { ...deviceById[device.id], ...device };
  }
  return Object.values(deviceById);
};

const listAssociatedDevices = async (
  cloudClient: TuyaCloudClient,
): Promise<TuyaAssociatedDevice[]> => {
  const devices: TuyaAssociatedDevice[] = [];
  let lastRowKey: string | undefined;
  for (let pageCount = 0; pageCount < 10; pageCount += 1) {
    const page = await requestOrUndefined<TuyaAssociatedDevicesResult>(cloudClient, {
      method: 'GET',
      path: '/v1.0/iot-01/associated-users/devices',
      query: {
        size: 50,
        ...(lastRowKey ? { last_row_key: lastRowKey } : {}),
      },
    });
    if (!page) {
      break;
    }
    devices.push(...parseAssociatedDevices(page));
    if (!page.has_more || !page.last_row_key) {
      break;
    }
    lastRowKey = page.last_row_key;
  }
  return devices;
};

const listAccountDevices = async ({
  cloudClient,
  uid,
  ownerId,
}: {
  cloudClient: TuyaCloudClient;
  uid?: string;
  ownerId?: string;
}): Promise<TuyaAssociatedDevice[]> => {
  const collected: TuyaAssociatedDevice[] = [...(await listAssociatedDevices(cloudClient))];

  if (uid) {
    const userDevices = await requestOrUndefined<unknown>(cloudClient, {
      method: 'GET',
      path: `/v1.0/users/${uid}/devices`,
      query: { page_no: 1, page_size: 100 },
    });
    collected.push(...parseAssociatedDevices(userDevices));
  }

  if (ownerId) {
    const homeDevices = await requestOrUndefined<unknown>(cloudClient, {
      method: 'GET',
      path: `/v1.0/homes/${ownerId}/devices`,
    });
    collected.push(...parseAssociatedDevices(homeDevices));
  }

  return mergeAccountDevices(collected);
};

const accountDeviceHasInfraredKeys = async ({
  cloudClient,
  infraredId,
  remoteId,
}: {
  cloudClient: TuyaCloudClient;
  infraredId: string;
  remoteId: string;
}): Promise<boolean> => {
  const keys = await requestOrUndefined<unknown>(cloudClient, {
    method: 'GET',
    path: `/v2.0/infrareds/${infraredId}/remotes/${remoteId}/keys`,
  });
  if (keys !== undefined) {
    return true;
  }
  const learningCodes = await requestOrUndefined<unknown>(cloudClient, {
    method: 'GET',
    path: `/v2.0/infrareds/${infraredId}/remotes/${remoteId}/learning-codes`,
  });
  return Array.isArray(learningCodes) ? learningCodes.length > 0 : learningCodes !== undefined;
};

export const lookupGatewayId = async ({
  cloudClient,
  deviceId,
}: {
  cloudClient: TuyaCloudClient;
  deviceId: string;
}): Promise<string | undefined> => {
  const devices = await listAssociatedDevices(cloudClient);
  return devices.find((device) => device.id === deviceId)?.gateway_id;
};

export const fetchDeviceDetail = async ({
  cloudClient,
  deviceId,
}: {
  cloudClient: TuyaCloudClient;
  deviceId: string;
}): Promise<TuyaDeviceDetail> => {
  const deviceDetail = await requestOrUndefined<TuyaDeviceDetail>(cloudClient, {
    method: 'GET',
    path: `/v1.0/devices/${deviceId}`,
  });
  return deviceDetail ?? {};
};

export const fetchInfraredRemotes = async ({
  cloudClient,
  infraredId,
  uid,
  ownerId,
}: {
  cloudClient: TuyaCloudClient;
  infraredId: string;
  uid?: string;
  ownerId?: string;
}): Promise<TuyaRemoteListItem[]> => {
  const collected: TuyaRemoteListItem[] = [];

  const v2Remotes = await requestOrUndefined<unknown>(cloudClient, {
    method: 'GET',
    path: `/v2.0/infrareds/${infraredId}/remotes`,
  });
  console.log(`v2 remotes payload: ${describeUnknown(v2Remotes)}`);
  collected.push(...parseRemoteList(v2Remotes));

  if (collected.length === 0) {
    const v1Remotes = await requestOrUndefined<unknown>(cloudClient, {
      method: 'GET',
      path: `/v1.0/infrareds/${infraredId}/remotes`,
    });
    console.log(`v1 remotes payload: ${describeUnknown(v1Remotes)}`);
    collected.push(...parseRemoteList(v1Remotes));
  }

  const subDevices = await requestOrUndefined<unknown>(cloudClient, {
    method: 'GET',
    path: `/v1.0/devices/${infraredId}/sub-devices`,
  });
  console.log(`sub-devices payload: ${describeUnknown(subDevices)}`);
  collected.push(
    ...parseRemoteList(subDevices).filter((remote) => remote.remote_id !== infraredId),
  );

  const accountDevices = await listAccountDevices({ cloudClient, uid, ownerId });
  if (accountDevices.length > 0) {
    console.log(`Account devices: ${accountDevices.length}`);
    collected.push(
      ...accountDevices.flatMap((device) => {
        if (!shouldIncludeAccountDeviceAsRemote({ device, infraredId })) {
          return [];
        }
        return [
          {
            remote_id: device.id,
            remote_name: device.name ?? device.id,
          },
        ];
      }),
    );

    const collectedIds = new Set(
      collected.flatMap((remote) => (remote.remote_id ? [remote.remote_id] : [])),
    );
    for (const device of accountDevices) {
      if (!device.id || collectedIds.has(device.id) || device.id === infraredId) {
        continue;
      }
      if (isInfraredHubCategory(device.category)) {
        continue;
      }
      const hasInfraredKeys = await accountDeviceHasInfraredKeys({
        cloudClient,
        infraredId,
        remoteId: device.id,
      });
      if (!hasInfraredKeys) {
        continue;
      }
      console.log(`Treating ${device.name ?? device.id} as an IR remote (keys API)`);
      collected.push({
        remote_id: device.id,
        remote_name: device.name ?? device.id,
      });
      collectedIds.add(device.id);
    }

    const otherHubs = accountDevices.filter(
      (device) =>
        Boolean(device.id) &&
        device.id !== infraredId &&
        !device.sub &&
        isInfraredHubCategory(device.category),
    );
    if (otherHubs.length > 0) {
      console.warn(
        `Other IR hubs on this account (not included in this export): ${otherHubs
          .map((hub) => hub.name ?? hub.id)
          .join(', ')}`,
      );
    }
  }

  return mergeRemoteById(collected);
};
