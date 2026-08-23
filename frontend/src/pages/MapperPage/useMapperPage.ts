import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  fetchCatalog,
  fetchMappings,
  fetchTemplates,
  testFireButton,
  upsertMappingDevice,
} from '../../libs/services/bridgeApi';
import { getButtonDisplayName } from '../../libs/buttonLabel';
import type { DeviceIrSourceAPI, DeviceMapping, DeviceTemplateIdAPI } from '../../libs/services/types';
import type { MapperPageProps } from '.';

const TRAINER_DEVICE_REMOTE_ID = 'trainer';

const isTrainerMapping = (device: Pick<DeviceMapping, 'irSource' | 'tuyaRemoteId'>): boolean => {
  return device.irSource === 'trainer' || device.tuyaRemoteId === TRAINER_DEVICE_REMOTE_ID;
};

interface CreateDeviceForm {
  name: string;
  template: DeviceTemplateIdAPI;
  irSource: DeviceIrSourceAPI;
}

const toDeviceId = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

export const useMapperPage = (_props: MapperPageProps) => {
  const queryClient = useQueryClient();
  const [selectedRemoteId, setSelectedRemoteId] = useState<string>('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedButtonId, setSelectedButtonId] = useState<string>('');

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: fetchCatalog,
  });
  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });
  const mappingsQuery = useQuery({
    queryKey: ['mappings'],
    queryFn: fetchMappings,
  });

  const createForm = useForm<CreateDeviceForm>({
    defaultValues: { name: '', template: 'fan', irSource: 'catalog' },
  });

  const remotes = useMemo(
    () => catalogQuery.data?.remotes ?? [],
    [catalogQuery.data?.remotes],
  );
  const selectedRemote = remotes.find((remote) => remote.remoteId === selectedRemoteId);
  const devices = mappingsQuery.data ?? [];
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
  const watchedTemplate = useWatch({ control: createForm.control, name: 'template' });
  const watchedIrSource = useWatch({ control: createForm.control, name: 'irSource' });
  const selectedTemplate = templatesQuery.data?.find(
    (template) => template.id === (selectedDevice?.template ?? watchedTemplate),
  );
  const isCreatingTrainerAc = watchedTemplate === 'ac' && watchedIrSource === 'trainer';
  const isSelectedTrainerDevice = Boolean(selectedDevice && isTrainerMapping(selectedDevice));

  const saveMutation = useMutation({
    mutationFn: upsertMappingDevice,
    onSuccess: async () => {
      toast.success('Mapping saved. MQTT entities will update if the broker is connected.');
      await queryClient.invalidateQueries({ queryKey: ['mappings'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const testFireMutation = useMutation({
    mutationFn: testFireButton,
    onSuccess: (result) => {
      toast.success(`Fired via ${result.path}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const onCreateDevice = createForm.handleSubmit((values) => {
    const shouldUseTrainer = values.template === 'ac' && values.irSource === 'trainer';
    if (!shouldUseTrainer && !selectedRemoteId) {
      toast.error('Pick a Tuya remote first.');
      return;
    }
    const id = toDeviceId(values.name);
    if (!id) {
      toast.error('Name is required.');
      return;
    }
    const device: DeviceMapping = {
      id,
      name: values.name,
      template: values.template,
      tuyaRemoteId: shouldUseTrainer ? TRAINER_DEVICE_REMOTE_ID : selectedRemoteId,
      irSource: shouldUseTrainer ? 'trainer' : 'catalog',
      slots: {},
    };
    setSelectedDeviceId(id);
    saveMutation.mutate(device);
  });

  const onAssignSlot = (slotId: string) => {
    if (!selectedDevice || !selectedButtonId) {
      toast.error('Select a Tuya button, then a slot.');
      return;
    }
    const nextDevice: DeviceMapping = {
      ...selectedDevice,
      slots: {
        ...selectedDevice.slots,
        [slotId]: { buttonId: selectedButtonId },
      },
    };
    saveMutation.mutate(nextDevice);
  };

  const onClearSlot = (slotId: string) => {
    if (!selectedDevice) {
      return;
    }
    const nextSlots = { ...selectedDevice.slots };
    delete nextSlots[slotId];
    saveMutation.mutate({ ...selectedDevice, slots: nextSlots });
  };

  const buttonById = useMemo(() => {
    const valueByKey: Record<string, string> = {};
    for (const remote of remotes) {
      for (const button of remote.buttons) {
        valueByKey[button.id] = getButtonDisplayName(button);
      }
    }
    return valueByKey;
  }, [remotes]);

  return {
    isCatalogLoading: catalogQuery.isLoading,
    catalogErrorMessage: catalogQuery.error instanceof Error ? catalogQuery.error.message : undefined,
    remotes,
    selectedRemoteId,
    selectedRemote,
    onSelectRemote: setSelectedRemoteId,
    devices,
    selectedDeviceId,
    selectedDevice,
    onSelectDevice: setSelectedDeviceId,
    selectedTemplate,
    selectedButtonId,
    onSelectButton: setSelectedButtonId,
    onTestFire: (buttonId: string) => testFireMutation.mutate(buttonId),
    isTestFirePending: testFireMutation.isPending,
    createForm,
    watchedTemplate,
    isCreatingTrainerAc,
    isSelectedTrainerDevice,
    onCreateDevice,
    onAssignSlot,
    onClearSlot,
    buttonById,
    isSavePending: saveMutation.isPending,
  };
};
