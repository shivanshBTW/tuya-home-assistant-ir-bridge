import type { CatalogButton, CatalogRemote } from '../types.js';
import type { TuyaCloudClient } from './cloudClient.js';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const readNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const readKeyIdFromButtonId = (buttonId: string): number | undefined => {
  const suffix = buttonId.split(':').at(-1);
  return suffix && /^\d+$/.test(suffix) ? Number(suffix) : undefined;
};

export interface CloudSendAttempt {
  label: string;
  path: string;
  body: Record<string, unknown>;
}

export const listCloudSendAttempts = ({
  infraredId,
  remote,
  button,
}: {
  infraredId: string;
  remote: CatalogRemote;
  button: CatalogButton;
}): CloudSendAttempt[] => {
  const raw = asRecord(button.raw);
  const keysRecord = asRecord(remote.keys);
  const categoryId = remote.categoryId ?? keysRecord.category_id;
  const remoteIndex = remote.remoteIndex ?? keysRecord.remote_index;
  const keyId = readNumber(raw.key_id) ?? readKeyIdFromButtonId(button.id);
  const isStandardKey = typeof raw.standard_key === 'boolean' ? raw.standard_key : undefined;

  const remotePath = `/v2.0/infrareds/${infraredId}/remotes/${remote.remoteId}`;
  const learningAttempt: CloudSendAttempt | undefined = button.code
    ? {
        label: 'learning-codes',
        path: `${remotePath}/learning-codes`,
        body: { code: button.code, key: button.key },
      }
    : undefined;
  const standardAttempt: CloudSendAttempt = {
    label: 'standard-command',
    path: `${remotePath}/command`,
    body: {
      category_id: categoryId,
      remote_index: remoteIndex,
      key: button.key,
    },
  };
  const rawAttempt: CloudSendAttempt = {
    label: 'raw-command',
    path: `${remotePath}/raw/command`,
    body: {
      category_id: categoryId,
      key: button.key,
      ...(keyId === undefined ? {} : { key_id: keyId }),
    },
  };

  const attempts: CloudSendAttempt[] = [];
  const pushUnique = (attempt: CloudSendAttempt | undefined): void => {
    if (!attempt || attempts.some((item) => item.label === attempt.label)) {
      return;
    }
    attempts.push(attempt);
  };

  if (button.source === 'learned' && learningAttempt) {
    pushUnique(learningAttempt);
  }
  if (isStandardKey === false) {
    pushUnique(rawAttempt);
  } else {
    pushUnique(standardAttempt);
  }
  pushUnique(rawAttempt);
  pushUnique(standardAttempt);
  pushUnique(learningAttempt);
  return attempts;
};

const isFatalCloudError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /not subscribed|No permissions|sign invalid|token expire|Unauthorized/i.test(message);
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
  const attempts = listCloudSendAttempts({ infraredId, remote, button });
  let lastError: unknown;

  for (const [attemptIndex, attempt] of attempts.entries()) {
    try {
      await cloudClient.request({
        method: 'POST',
        path: attempt.path,
        body: attempt.body,
      });
      return;
    } catch (error) {
      lastError = error;
      if (isFatalCloudError(error) || attemptIndex === attempts.length - 1) {
        throw error;
      }
      console.warn(
        `Cloud send ${attempt.label} failed for ${button.key}, trying next: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Cloud send failed');
};
