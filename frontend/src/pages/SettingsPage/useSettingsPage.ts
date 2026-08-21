import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { useForm } from 'react-hook-form';
import { exportCatalog, fetchLocalHost } from '../../libs/services/bridgeApi';
import { getApiToken, setApiToken } from '../../libs/services/bridgeClient';
import type { SettingsPageProps } from '.';

interface SettingsForm {
  apiToken: string;
}

export const useSettingsPage = (_props: SettingsPageProps) => {
  const queryClient = useQueryClient();
  const form = useForm<SettingsForm>({
    defaultValues: { apiToken: getApiToken() },
  });

  const localHostQuery = useQuery({
    queryKey: ['local-host'],
    queryFn: () => fetchLocalHost({ shouldScanSubnet: false }),
    retry: false,
  });

  const exportMutation = useMutation({
    mutationFn: exportCatalog,
    onSuccess: async (catalog) => {
      toast.success(`Exported ${catalog.remotes.length} remotes`);
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      await queryClient.invalidateQueries({ queryKey: ['local-host'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const findLocalHostMutation = useMutation({
    mutationFn: () => fetchLocalHost({ shouldScanSubnet: true }),
    onSuccess: (status) => {
      queryClient.setQueryData(['local-host'], status);
      if (status.host) {
        toast.success(`Found IR blaster at ${status.host}`);
        return;
      }
      toast.error('No LAN IP found. Set TUYA_LOCAL_IP or TUYA_LOCAL_MAC.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSaveToken = form.handleSubmit((values) => {
    setApiToken(values.apiToken.trim());
    toast.success('API token saved in this browser');
    void queryClient.invalidateQueries({ queryKey: ['local-host'] });
  });

  return {
    form,
    onSaveToken,
    onExport: () => exportMutation.mutate(),
    isExportPending: exportMutation.isPending,
    localHost: localHostQuery.data?.host,
    hasLocalKey: Boolean(localHostQuery.data?.hasLocalKey),
    onFindLocalHost: () => findLocalHostMutation.mutate(),
    isFindLocalHostPending: findLocalHostMutation.isPending,
  };
};
