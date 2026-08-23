import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { useMemo, useState } from 'react';
import {
  fetchTrainer,
  fireTrainerCell,
  generateTrainer,
  inferTrainer,
  listenTrainerSample,
  saveTrainerSchema,
  submitTrainerTextSample,
} from '../../libs/services/bridgeApi';
import type {
  TrainerCaptureStep,
  TrainerGeneratedCell,
  TrainerSchema,
} from '../../libs/services/types';
import type { TrainerPageProps } from '.';

const trainerStepKey = (step: TrainerCaptureStep): string => {
  return step.id;
};

const sampleMatchesStep = ({
  sample,
  step,
}: {
  sample: { unlockedParamId: string; paramValues: Record<string, string>; probeIndex?: number; probeParamId?: string };
  step: TrainerCaptureStep;
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
  return [...paramIds].every((paramId) => sample.paramValues[paramId] === step.paramValues[paramId]);
};

export const useTrainerPage = (_props: TrainerPageProps) => {
  const queryClient = useQueryClient();
  const trainerQuery = useQuery({
    queryKey: ['trainer'],
    queryFn: fetchTrainer,
  });
  const [schemaDraft, setSchemaDraft] = useState<TrainerSchema | undefined>(undefined);
  const [pasteByStepId, setPasteByStepId] = useState<Record<string, string>>({});
  const [pasteByCellId, setPasteByCellId] = useState<Record<string, string>>({});
  const [generateFilter, setGenerateFilter] = useState<'ready' | 'needs_input' | 'all'>('ready');
  const [generateModeId, setGenerateModeId] = useState('');
  const schema = schemaDraft ?? trainerQuery.data?.schema;
  const inference = trainerQuery.data?.inference;
  const generation = trainerQuery.data?.generation;
  const sampleByStepId = useMemo(() => {
    const samples = trainerQuery.data?.samples ?? [];
    const capturePlan = trainerQuery.data?.capturePlan ?? [];
    return Object.fromEntries(
      capturePlan.flatMap((step) => {
        const sample = samples.find((item) => sampleMatchesStep({ sample: item, step }));
        return sample ? [[trainerStepKey(step), sample]] : [];
      }),
    );
  }, [trainerQuery.data?.capturePlan, trainerQuery.data?.samples]);
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
    onSuccess: async () => {
      toast.success('Sent generated frame');
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
    const cells = generation?.cells ?? [];
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

  return {
    schema,
    onSchemaChange: setSchemaDraft,
    capturePlan,
    sampleByStepId,
    nextStepId: nextStep ? trainerStepKey(nextStep) : undefined,
    inference,
    generation,
    visibleGenerateCells,
    generateFilter,
    generateModeId,
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
    onGenerateModeChange: setGenerateModeId,
    onPasteCellChange: (cellId: string, text: string) => {
      setPasteByCellId((current) => ({ ...current, [cellId]: text }));
    },
    onFireCell: (cell: TrainerGeneratedCell) => {
      fireMutation.mutate({ cellId: cell.id, bits: cell.bits });
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
