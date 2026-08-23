import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchCatalogRemoteBits } from '../../libs/services/bridgeApi';
import type { CatalogBitsPageProps } from '.';

export const useCatalogBitsPage = (_props: CatalogBitsPageProps) => {
  const [remoteId, setRemoteId] = useState('');
  const remoteBitsQuery = useQuery({
    queryKey: ['catalog-remote-bits', remoteId],
    queryFn: () => fetchCatalogRemoteBits({ remoteId: remoteId || undefined }),
  });

  return {
    remotes: remoteBitsQuery.data?.remotes ?? [],
    selectedRemoteId: remoteBitsQuery.data?.selectedRemoteId ?? remoteId,
    remoteName: remoteBitsQuery.data?.remoteName,
    buttons: remoteBitsQuery.data?.buttons ?? [],
    onSelectRemote: setRemoteId,
    isLoading: remoteBitsQuery.isLoading,
    errorMessage: remoteBitsQuery.error instanceof Error ? remoteBitsQuery.error.message : undefined,
  };
};
