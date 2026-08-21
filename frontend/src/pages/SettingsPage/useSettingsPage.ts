import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { useForm } from 'react-hook-form';
import { exportCatalog } from '../../libs/services/bridgeApi';
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

  const exportMutation = useMutation({
    mutationFn: exportCatalog,
    onSuccess: async (catalog) => {
      toast.success(`Exported ${catalog.remotes.length} remotes`);
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSaveToken = form.handleSubmit((values) => {
    setApiToken(values.apiToken.trim());
    toast.success('API token saved in this browser');
  });

  return {
    form,
    onSaveToken,
    onExport: () => exportMutation.mutate(),
    isExportPending: exportMutation.isPending,
  };
};
