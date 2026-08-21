import { useQuery } from '@tanstack/react-query';
import { fetchLocalHost } from '../../libs/services/bridgeApi';
import type { AppLayoutProps } from '.';

export const useAppLayout = (props: AppLayoutProps) => {
  const localHostQuery = useQuery({
    queryKey: ['local-host'],
    queryFn: () => fetchLocalHost({ shouldScanSubnet: false }),
    retry: false,
  });

  return {
    children: props.children,
    localHost: localHostQuery.data?.host,
  };
};
