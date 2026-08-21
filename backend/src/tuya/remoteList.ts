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
}

export interface TuyaAssociatedDevice {
  id?: string;
  name?: string;
  sub?: boolean;
  gateway_id?: string;
  category?: string;
}

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
  if (deviceDetail.sub && deviceDetail.gateway_id) {
    return deviceDetail.gateway_id;
  }
  return deviceDetail.id ?? requestedId;
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
    devices.push(...(page.devices ?? []));
    if (!page.has_more || !page.last_row_key) {
      break;
    }
    lastRowKey = page.last_row_key;
  }
  return devices;
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
}: {
  cloudClient: TuyaCloudClient;
  infraredId: string;
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

  const associatedDevices = await listAssociatedDevices(cloudClient);
  if (associatedDevices.length > 0) {
    console.log(`Associated account devices: ${associatedDevices.length}`);
    collected.push(
      ...associatedDevices.flatMap((device) => {
        if (!device.id || device.id === infraredId) {
          return [];
        }
        if (device.gateway_id !== infraredId) {
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

    const otherHubs = associatedDevices.filter((device) => {
      if (!device.id || device.id === infraredId || device.sub) {
        return false;
      }
      const category = device.category ?? '';
      return category === 'qt' || category === 'wnykq' || category.includes('infrared');
    });
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
