import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { useMemo, useState } from 'react';
import {
  fetchMappings,
  fetchTrainer,
  fireTrainerCell,
  generateTrainer,
  inferTrainer,
  listenTrainerSample,
  saveTrainerSchema,
  submitTrainerTextSample,
  upsertMappingDevice,
} from '../../libs/services/bridgeApi';
import type {
  TrainerCaptureStep,
  TrainerGeneratedCell,
  TrainerSchema,
} from '../../libs/services/types';
import type { TrainerPageProps } from '.';

const TRAINER_DEVICE_REMOTE_ID = 'trainer';
const DEFAULT_HA_DEVICE_NAME = 'Bedroom AC';

const toDeviceId = (name: string): string => {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const trainerStepKey = (step: TrainerCaptureStep): string => {
  return step.id;
};

const sampleMatchesStep = ({
  sample,
  step,
  separateCommandParamIds,
}: {
  sample: {
    unlockedParamId: string;
    paramValues: Record<string, string>;
    probeIndex?: number;
    probeParamId?: string;
  };
  step: TrainerCaptureStep;
  separateCommandParamIds: Set<string>;
}): boolean => {
  if (sample.unlockedParamId !== step.unlockedParamId) {
    return false;
  }
  if ((sample.probeIndex ?? undefined) !== (step.probeIndex ?? undefined)) {
    return false;
  }
  if ((sample.probeParamId ?? undefined) !== (step.probeParamId ?? undefined)) {
    return false;
  }
  const paramIds = new Set([...Object.keys(sample.paramValues), ...Object.keys(step.paramValues)]);
  return [...paramIds].every((paramId) => {
    if (separateCommandParamIds.has(paramId) && step.unlockedParamId !== paramId) {
      return true;
    }
    return sample.paramValues[paramId] === step.paramValues[paramId];
  });
};

export const useTrainerPage = (_props: TrainerPageProps) => {
  const queryClient = useQueryClient();
  const trainerQuery = useQuery({
    queryKey: ['trainer'],
    queryFn: fetchTrainer,
  });
  const mappingsQuery = useQuery({
    queryKey: ['mappings'],
    queryFn: fetchMappings,
  });
  const publishedTrainerDevice = (mappingsQuery.data ?? []).find(
    (device) =>
      device.template === 'ac' &&
      (device.irSource === 'trainer' || device.tuyaRemoteId === TRAINER_DEVICE_REMOTE_ID),
  );
  const [schemaDraft, setSchemaDraft] = useState<TrainerSchema | undefined>(undefined);
  const [pasteByStepId, setPasteByStepId] = useState<Record<string, string>>({});
  const [pasteByCellId, setPasteByCellId] = useState<Record<string, string>>({});
  const [generateFilter, setGenerateFilter] = useState<'ready' | 'needs_input' | 'all'>('ready');
  const [generateModeId, setGenerateModeId] = useState('');
  const [selectedTempId, setSelectedTempId] = useState('');
  const [selectedSpeedId, setSelectedSpeedId] = useState('');
  const [haDeviceName, setHaDeviceName] = useState(DEFAULT_HA_DEVICE_NAME);
  const schema = schemaDraft ?? trainerQuery.data?.schema;
  const inference = trainerQuery.data?.inference;
  const generation = trainerQuery.data?.generation;
  const separateCommandParamIds = useMemo(() => {
    return new Set(
      (schema?.params ?? []).filter((param) => param.isSeparateCommand).map((param) => param.id),
    );
  }, [schema?.params]);
  const sampleByStepId = useMemo(() => {
    const samples = trainerQuery.data?.samples ?? [];
    const capturePlan = trainerQuery.data?.capturePlan ?? [];
    return Object.fromEntries(
      capturePlan.flatMap((step) => {
        const sample = samples.find((item) =>
          sampleMatchesStep({ sample: item, step, separateCommandParamIds }),
        );
        return sample ? [[trainerStepKey(step), sample]] : [];
      }),
    );
  }, [separateCommandParamIds, trainerQuery.data?.capturePlan, trainerQuery.data?.samples]);
  const capturePlan = trainerQuery.data?.capturePlan ?? [];
  const nextStep = capturePlan.find((step) => !sampleByStepId[trainerStepKey(step)]);

  const saveSchemaMutation = useMutation({
    mutationFn: saveTrainerSchema,
    onSuccess: async (result) => {
      toast.success('Trainer schema saved');
      setSchemaDraft(undefined);
      queryClient.setQueryData(['trainer'], result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const listenMutation = useMutation({
    mutationFn: listenTrainerSample,
    onSuccess: async (result) => {
      toast.success('Captured trainer sample');
      queryClient.setQueryData(['trainer'], result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const textMutation = useMutation({
    mutationFn: submitTrainerTextSample,
    onSuccess: async (result) => {
      toast.success('Saved pasted sample');
      queryClient.setQueryData(['trainer'], result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inferMutation = useMutation({
    mutationFn: inferTrainer,
    onSuccess: async (result) => {
      toast.success('Inference updated');
      queryClient.setQueryData(['trainer'], result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generateMutation = useMutation({
    mutationFn: generateTrainer,
    onSuccess: async (result) => {
      toast.success('Generated ready combos');
      queryClient.setQueryData(['trainer'], result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fireMutation = useMutation({
    mutationFn: fireTrainerCell,
    onError: (error: Error) => toast.error(error.message),
  });

  const publishHaMutation = useMutation({
    mutationFn: upsertMappingDevice,
    onSuccess: async () => {
      toast.success(
        'Published to Home Assistant. Expose that climate entity, then say Hey Google, sync my devices.',
      );
      await queryClient.invalidateQueries({ queryKey: ['mappings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlockedParamIdForCell = (cell: TrainerGeneratedCell): string => {
    const unresolvedParamId = inference?.fields.find(
      (field) => field.kind === 'unresolved' && cell.paramValues[field.paramId],
    )?.paramId;
    return unresolvedParamId ?? schema?.primaryParamId ?? 'mode';
  };

  const visibleGenerateCells = useMemo(() => {
    const cells = (generation?.cells ?? []).filter((cell) => cell.kind !== 'command');
    return cells.filter((cell) => {
      if (generateModeId && cell.paramValues[schema?.primaryParamId ?? 'mode'] !== generateModeId) {
        return false;
      }
      if (generateFilter === 'ready') {
        return Boolean(cell.bits);
      }
      if (generateFilter === 'needs_input') {
        return cell.status === 'needs_input';
      }
      return true;
    });
  }, [generateFilter, generateModeId, generation?.cells, schema?.primaryParamId]);
  const commandCells = useMemo(() => {
    return (generation?.cells ?? []).filter((cell) => cell.kind === 'command');
  }, [generation?.cells]);
  const pickerModeId = generateModeId || schema?.anchorValues[schema.primaryParamId] || '';
  const frameCells = useMemo(() => {
    return (generation?.cells ?? []).filter((cell) => cell.kind !== 'command');
  }, [generation?.cells]);
  const pickerTempOptionIds = useMemo(() => {
    return [
      ...new Set(
        frameCells
          .filter((cell) => cell.paramValues[schema?.primaryParamId ?? 'mode'] === pickerModeId)
          .map((cell) => cell.paramValues.temp)
          .filter((optionId): optionId is string => Boolean(optionId)),
      ),
    ];
  }, [frameCells, pickerModeId, schema?.primaryParamId]);
  const pickerSpeedOptionIds = useMemo(() => {
    return [
      ...new Set(
        frameCells
          .filter((cell) => cell.paramValues[schema?.primaryParamId ?? 'mode'] === pickerModeId)
          .map((cell) => cell.paramValues.speed)
          .filter((optionId): optionId is string => Boolean(optionId)),
      ),
    ];
  }, [frameCells, pickerModeId, schema?.primaryParamId]);
  const effectiveTempId =
    selectedTempId && pickerTempOptionIds.includes(selectedTempId)
      ? selectedTempId
      : pickerTempOptionIds.includes(schema?.anchorValues.temp ?? '')
        ? (schema?.anchorValues.temp ?? '')
        : (pickerTempOptionIds[0] ?? '');
  const effectiveSpeedId =
    selectedSpeedId && pickerSpeedOptionIds.includes(selectedSpeedId)
      ? selectedSpeedId
      : pickerSpeedOptionIds.includes(schema?.anchorValues.speed ?? '')
        ? (schema?.anchorValues.speed ?? '')
        : (pickerSpeedOptionIds[0] ?? '');
  const selectedFrameCell = useMemo(() => {
    return frameCells.find((cell) => {
      if (cell.paramValues[schema?.primaryParamId ?? 'mode'] !== pickerModeId) {
        return false;
      }
      if (pickerTempOptionIds.length > 0 && cell.paramValues.temp !== effectiveTempId) {
        return false;
      }
      if (pickerSpeedOptionIds.length > 0 && cell.paramValues.speed !== effectiveSpeedId) {
        return false;
      }
      return true;
    });
  }, [
    effectiveSpeedId,
    effectiveTempId,
    frameCells,
    pickerModeId,
    pickerSpeedOptionIds.length,
    pickerTempOptionIds.length,
    schema?.primaryParamId,
  ]);

  const pickerOptionIds = (modeId: string, paramId: 'temp' | 'speed'): string[] => {
    return [
      ...new Set(
        frameCells
          .filter((cell) => cell.paramValues[schema?.primaryParamId ?? 'mode'] === modeId)
          .map((cell) => cell.paramValues[paramId])
          .filter((optionId): optionId is string => Boolean(optionId)),
      ),
    ];
  };

  const resolvePickerOptionId = ({
    selectedOptionId,
    optionIds,
    anchorOptionId,
  }: {
    selectedOptionId: string;
    optionIds: string[];
    anchorOptionId?: string;
  }): string => {
    if (selectedOptionId && optionIds.includes(selectedOptionId)) {
      return selectedOptionId;
    }
    if (anchorOptionId && optionIds.includes(anchorOptionId)) {
      return anchorOptionId;
    }
    return optionIds[0] ?? '';
  };

  const firePickerSelection = ({
    modeId,
    tempId,
    speedId,
  }: {
    modeId: string;
    tempId: string;
    speedId: string;
  }) => {
    const tempOptionIds = pickerOptionIds(modeId, 'temp');
    const speedOptionIds = pickerOptionIds(modeId, 'speed');
    const nextTempId = resolvePickerOptionId({
      selectedOptionId: tempId,
      optionIds: tempOptionIds,
      anchorOptionId: schema?.anchorValues.temp,
    });
    const nextSpeedId = resolvePickerOptionId({
      selectedOptionId: speedId,
      optionIds: speedOptionIds,
      anchorOptionId: schema?.anchorValues.speed,
    });
    const cell = frameCells.find((frameCell) => {
      if (frameCell.paramValues[schema?.primaryParamId ?? 'mode'] !== modeId) {
        return false;
      }
      if (tempOptionIds.length > 0 && frameCell.paramValues.temp !== nextTempId) {
        return false;
      }
      if (speedOptionIds.length > 0 && frameCell.paramValues.speed !== nextSpeedId) {
        return false;
      }
      return true;
    });
    if (!cell?.bits) {
      toast.error('No generated combo for this selection yet');
      return;
    }
    fireMutation.mutate({ cellId: cell.id, bits: cell.bits });
  };

  return {
    schema,
    onSchemaChange: setSchemaDraft,
    capturePlan,
    sampleByStepId,
    nextStepId: nextStep ? trainerStepKey(nextStep) : undefined,
    inference,
    generation,
    visibleGenerateCells,
    commandCells,
    generateFilter,
    generateModeId,
    pickerModeId,
    pickerTempOptionIds,
    pickerSpeedOptionIds,
    selectedTempId: effectiveTempId,
    selectedSpeedId: effectiveSpeedId,
    selectedFrameCell,
    pasteByStepId,
    pasteByCellId,
    onPasteChange: (stepId: string, text: string) => {
      setPasteByStepId((current) => ({ ...current, [stepId]: text }));
    },
    onSaveSchema: () => schema && saveSchemaMutation.mutate(schema),
    onListen: (step: TrainerCaptureStep) => {
      toast.info('Point the remote at the blaster');
      listenMutation.mutate({
        paramValues: step.paramValues,
        unlockedParamId: step.unlockedParamId,
        probeParamId: step.probeParamId,
        probeIndex: step.probeIndex,
      });
    },
    onSubmitText: (step: TrainerCaptureStep) => {
      const text = pasteByStepId[trainerStepKey(step)]?.trim() ?? '';
      textMutation.mutate({
        paramValues: step.paramValues,
        unlockedParamId: step.unlockedParamId,
        probeParamId: step.probeParamId,
        probeIndex: step.probeIndex,
        text,
      });
    },
    onInfer: () => inferMutation.mutate(),
    onGenerate: () => generateMutation.mutate(),
    onGenerateFilterChange: setGenerateFilter,
    onGenerateModeChange: (modeId: string) => {
      setGenerateModeId(modeId);
      firePickerSelection({
        modeId,
        tempId: effectiveTempId,
        speedId: effectiveSpeedId,
      });
    },
    onSelectedTempChange: (tempId: string) => {
      setSelectedTempId(tempId);
      firePickerSelection({
        modeId: pickerModeId,
        tempId,
        speedId: effectiveSpeedId,
      });
    },
    onSelectedSpeedChange: (speedId: string) => {
      setSelectedSpeedId(speedId);
      firePickerSelection({
        modeId: pickerModeId,
        tempId: effectiveTempId,
        speedId,
      });
    },
    onPasteCellChange: (cellId: string, text: string) => {
      setPasteByCellId((current) => ({ ...current, [cellId]: text }));
    },
    onFireCell: (cell: TrainerGeneratedCell) => {
      fireMutation.mutate(
        { cellId: cell.id, bits: cell.bits },
        {
          onSuccess: () => toast.success('Sent generated frame'),
        },
      );
    },
    onListenCell: (cell: TrainerGeneratedCell) => {
      toast.info('Point the remote at the blaster');
      listenMutation.mutate({
        paramValues: cell.paramValues,
        unlockedParamId: unlockedParamIdForCell(cell),
      });
    },
    onSubmitCellText: (cell: TrainerGeneratedCell) => {
      const text = pasteByCellId[cell.id]?.trim() ?? '';
      textMutation.mutate({
        paramValues: cell.paramValues,
        unlockedParamId: unlockedParamIdForCell(cell),
        text,
      });
    },
    haDeviceName,
    publishedTrainerDeviceName: publishedTrainerDevice?.name,
    onHaDeviceNameChange: setHaDeviceName,
    onPublishToHomeAssistant: () => {
      const id = toDeviceId(haDeviceName) || publishedTrainerDevice?.id;
      if (!id) {
        toast.error('Name is required.');
        return;
      }
      publishHaMutation.mutate({
        id,
        name: haDeviceName.trim() || DEFAULT_HA_DEVICE_NAME,
        template: 'ac',
        tuyaRemoteId: TRAINER_DEVICE_REMOTE_ID,
        irSource: 'trainer',
        slots: {},
      });
    },
    isPublishHaPending: publishHaMutation.isPending,
    isLoading: trainerQuery.isLoading,
    isSavePending: saveSchemaMutation.isPending,
    isListenPending: listenMutation.isPending,
    isTextPending: textMutation.isPending,
    isInferPending: inferMutation.isPending,
    isGeneratePending: generateMutation.isPending,
    isFirePending: fireMutation.isPending,
    errorMessage: trainerQuery.error instanceof Error ? trainerQuery.error.message : undefined,
  };
};
