import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { fetchCatalog, fetchMappings, testFireButton } from '../../libs/services/bridgeApi';
import type { KeypadPageProps } from '.';

export const useKeypadPage = (_props: KeypadPageProps) => {
  const catalogQuery = useQuery({ queryKey: ['catalog'], queryFn: fetchCatalog });
  const mappingsQuery = useQuery({ queryKey: ['mappings'], queryFn: fetchMappings });

  const mappedButtonIds = new Set(
    (mappingsQuery.data ?? []).flatMap((device) =>
      Object.values(device.slots).map((slot) => slot.buttonId),
    ),
  );

  const leftoverButtons = (catalogQuery.data?.remotes ?? []).flatMap((remote) =>
    remote.buttons
      .filter((button) => !mappedButtonIds.has(button.id))
      .map((button) => ({ ...button, remoteName: remote.remoteName })),
  );

  const testFireMutation = useMutation({
    mutationFn: testFireButton,
    onSuccess: (result) => toast.success(`Fired via ${result.path}`),
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    leftoverButtons,
    onTestFire: (buttonId: string) => testFireMutation.mutate(buttonId),
    isTestFirePending: testFireMutation.isPending,
    isLoading: catalogQuery.isLoading,
  };
};
