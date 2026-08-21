import type { CatalogButton, CatalogRemote } from '../types.js';
import type { TuyaCloudClient } from './cloudClient.js';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

export const sendCloudButton = async ({
  cloudClient,
  infraredId,
  remote,
  button,
}: {
  cloudClient: TuyaCloudClient;
  infraredId: string;
  remote: CatalogRemote;
  button: CatalogButton;
}): Promise<void> => {
  if (button.source === 'learned' && button.code) {
    await cloudClient.request({
      method: 'POST',
      path: `/v2.0/infrareds/${infraredId}/remotes/${remote.remoteId}/learning-codes`,
      body: {
        code: button.code,
        key: button.key,
      },
    });
    return;
  }

  const keysRecord = asRecord(remote.keys);
  const categoryId = remote.categoryId ?? keysRecord.category_id;
  const remoteIndex = remote.remoteIndex ?? keysRecord.remote_index;

  await cloudClient.request({
    method: 'POST',
    path: `/v2.0/infrareds/${infraredId}/remotes/${remote.remoteId}/command`,
    body: {
      category_id: categoryId,
      remote_index: remoteIndex,
      key: button.key,
    },
  });
};
