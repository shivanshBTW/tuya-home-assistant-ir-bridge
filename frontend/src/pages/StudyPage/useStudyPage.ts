import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'material-react-toastify';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  fetchStudy,
  fetchStudyDiff,
  listenStudyCapture,
  replayStudyCapture,
  saveStudyButton,
} from '../../libs/services/bridgeApi';
import type { StudyPageProps } from '.';

interface SaveCaptureForm {
  captureId: string;
  label: string;
  notes: string;
  compareCaptureId: string;
}

const formatLogLine = ({
  receivedAt,
  pulseCount,
  code,
  label,
}: {
  receivedAt: string;
  pulseCount: number;
  code: string;
  label?: string;
}): string => {
  const preview = code.length > 24 ? `${code.slice(0, 24)}…` : code;
  const named = label ? `  ${label}` : '';
  return `${receivedAt}  pulses=${pulseCount}  ${preview}${named}`;
};

export const useStudyPage = (_props: StudyPageProps) => {
  const queryClient = useQueryClient();
  const form = useForm<SaveCaptureForm>({
    defaultValues: { captureId: '', label: '', notes: '', compareCaptureId: '' },
  });
  const selectedCaptureId = useWatch({ control: form.control, name: 'captureId' });
  const compareCaptureId = useWatch({ control: form.control, name: 'compareCaptureId' });

  const studyQuery = useQuery({
    queryKey: ['study'],
    queryFn: fetchStudy,
  });

  const log = useMemo(() => studyQuery.data?.log ?? [], [studyQuery.data?.log]);
  const savedButtons = useMemo(
    () => studyQuery.data?.savedButtons ?? [],
    [studyQuery.data?.savedButtons],
  );
  const selectedCapture = log.find((capture) => capture.id === selectedCaptureId);
  const labelByCaptureId = useMemo(() => {
    return Object.fromEntries(savedButtons.map((button) => [button.captureId, button.label]));
  }, [savedButtons]);

  const logText = log
    .map((capture) =>
      formatLogLine({
        receivedAt: capture.receivedAt,
        pulseCount: capture.pulseCount,
        code: capture.code,
        label: labelByCaptureId[capture.id],
      }),
    )
    .join('\n');

  const diffQuery = useQuery({
    queryKey: ['study-diff', selectedCaptureId, compareCaptureId],
    queryFn: () =>
      fetchStudyDiff({
        leftCaptureId: selectedCaptureId,
        rightCaptureId: compareCaptureId,
      }),
    enabled: Boolean(selectedCaptureId && compareCaptureId && selectedCaptureId !== compareCaptureId),
  });

  const listenMutation = useMutation({
    mutationFn: listenStudyCapture,
    onSuccess: async (result) => {
      toast.success(`Captured ${result.capture.pulseCount} pulses`);
      form.setValue('captureId', result.capture.id);
      await queryClient.invalidateQueries({ queryKey: ['study'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMutation = useMutation({
    mutationFn: saveStudyButton,
    onSuccess: async () => {
      toast.success('Saved named button to study.json');
      await queryClient.invalidateQueries({ queryKey: ['study'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const replayMutation = useMutation({
    mutationFn: replayStudyCapture,
    onSuccess: (result) => toast.success(`Fired via ${result.path}`),
    onError: (error: Error) => toast.error(error.message),
  });

  const onListen = () => {
    toast.info('Point the LG remote at the blaster receiver');
    listenMutation.mutate();
  };

  const onSave = form.handleSubmit((values) => {
    saveMutation.mutate({
      captureId: values.captureId,
      label: values.label,
      notes: values.notes.trim() === '' ? undefined : values.notes.trim(),
    });
  });

  return {
    form,
    selectedCaptureId,
    logText,
    log,
    savedButtons,
    selectedCapture,
    compareCaptureId,
    diffs: diffQuery.data?.diffs ?? [],
    onListen,
    onSave,
    onReplay: (captureId: string) => replayMutation.mutate(captureId),
    isListenPending: listenMutation.isPending,
    isSavePending: saveMutation.isPending,
    isReplayPending: replayMutation.isPending,
    isLoading: studyQuery.isLoading,
  };
};
