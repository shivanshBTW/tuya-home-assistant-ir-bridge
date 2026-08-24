import type { Catalog, CatalogRemote, CatalogRemoteBits } from '../types.js';
import { decodeIrCode } from './irDecode.js';

const LG_REMOTE_PATTERN = /lg/i;

const isLgRemote = (remote: CatalogRemote): boolean => {
  return (
    LG_REMOTE_PATTERN.test(remote.remoteName ?? '') ||
    LG_REMOTE_PATTERN.test(remote.brandName ?? '')
  );
};

export const listCatalogRemoteBits = ({
  catalog,
  remoteId,
}: {
  catalog: Catalog;
  remoteId?: string;
}): CatalogRemoteBits => {
  if (catalog.remotes.length === 0) {
    throw new Error('No remotes in catalog');
  }

  const requestedRemoteId = remoteId?.trim();
  const selectedRemote = requestedRemoteId
    ? catalog.remotes.find((remote) => remote.remoteId === requestedRemoteId)
    : (catalog.remotes.find(isLgRemote) ?? catalog.remotes[0]);

  if (!selectedRemote) {
    throw new Error(`Unknown remote ${requestedRemoteId}`);
  }

  return {
    remotes: catalog.remotes.map((remote) => ({
      remoteId: remote.remoteId,
      remoteName: remote.remoteName,
      buttonCount: remote.buttons.length,
    })),
    selectedRemoteId: selectedRemote.remoteId,
    remoteName: selectedRemote.remoteName,
    buttons: selectedRemote.buttons.map((button) => {
      const decode = decodeIrCode(button.code ?? '');
      return {
        id: button.id,
        key: button.key,
        keyName: button.keyName,
        kind: decode.kind,
        bits: decode.bits,
        pulseCount: decode.pulseCount,
      };
    }),
  };
};
