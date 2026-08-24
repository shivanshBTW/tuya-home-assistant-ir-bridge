import type { FC } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { TrainerConstraint, TrainerSchema } from '../../libs/services/types';
import { TrainerGenerate } from './items/TrainerGenerate';
import type { useTrainerPage } from './useTrainerPage';

type Props = ReturnType<typeof useTrainerPage>;

const formatBits = (bits: string): string => bits.match(/.{1,4}/g)?.join(' ') ?? bits;

const constraintFor = ({
  schema,
  primaryOptionId,
  paramId,
}: {
  schema: TrainerSchema;
  primaryOptionId: string;
  paramId: string;
}): TrainerConstraint => {
  return schema.constraints[primaryOptionId]?.[paramId] ?? { kind: 'all' };
};

const setConstraint = ({
  schema,
  primaryOptionId,
  paramId,
  constraint,
}: {
  schema: TrainerSchema;
  primaryOptionId: string;
  paramId: string;
  constraint: TrainerConstraint;
}): TrainerSchema => {
  return {
    ...schema,
    constraints: {
      ...schema.constraints,
      [primaryOptionId]: {
        ...(schema.constraints[primaryOptionId] ?? {}),
        [paramId]: constraint,
      },
    },
  };
};

export const TrainerPage: FC<Props> = ({
  schema,
  onSchemaChange,
  capturePlan,
  sampleByStepId,
  nextStepId,
  inference,
  generation,
  visibleGenerateCells,
  commandCells,
  generateFilter,
  pickerModeId,
  pickerTempOptionIds,
  pickerSpeedOptionIds,
  selectedTempId,
  selectedSpeedId,
  selectedFrameCell,
  pasteByStepId,
  pasteByCellId,
  onPasteChange,
  onSaveSchema,
  onListen,
  onSubmitText,
  onInfer,
  onGenerate,
  onGenerateFilterChange,
  onGenerateModeChange,
  onSelectedTempChange,
  onSelectedSpeedChange,
  onPasteCellChange,
  onFireCell,
  onListenCell,
  onSubmitCellText,
  haDeviceName,
  publishedTrainerDeviceName,
  onHaDeviceNameChange,
  onPublishToHomeAssistant,
  isPublishHaPending,
  isLoading,
  isSavePending,
  isListenPending,
  isTextPending,
  isInferPending,
  isGeneratePending,
  isFirePending,
  errorMessage,
}) => {
  const primaryParam = schema?.params.find((param) => param.id === schema.primaryParamId);

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Train</Typography>
      <Typography color="text.secondary">
        Generated combos are in Remote at the top. Cycle below is only last time’s capture checklist
        — it will not grow new temps.
      </Typography>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
      {isLoading && <Typography color="text.secondary">Loading trainer…</Typography>}

      <TrainerGenerate
        schema={schema}
        generation={generation}
        visibleGenerateCells={visibleGenerateCells}
        commandCells={commandCells}
        generateFilter={generateFilter}
        pickerModeId={pickerModeId}
        pickerTempOptionIds={pickerTempOptionIds}
        pickerSpeedOptionIds={pickerSpeedOptionIds}
        selectedTempId={selectedTempId}
        selectedSpeedId={selectedSpeedId}
        selectedFrameCell={selectedFrameCell}
        pasteByCellId={pasteByCellId}
        onGenerateFilterChange={onGenerateFilterChange}
        onGenerateModeChange={onGenerateModeChange}
        onSelectedTempChange={onSelectedTempChange}
        onSelectedSpeedChange={onSelectedSpeedChange}
        onPasteCellChange={onPasteCellChange}
        onGenerate={onGenerate}
        onFireCell={onFireCell}
        onListenCell={onListenCell}
        onSubmitCellText={onSubmitCellText}
        haDeviceName={haDeviceName}
        publishedTrainerDeviceName={publishedTrainerDeviceName}
        onHaDeviceNameChange={onHaDeviceNameChange}
        onPublishToHomeAssistant={onPublishToHomeAssistant}
        isPublishHaPending={isPublishHaPending}
        isGeneratePending={isGeneratePending}
        isFirePending={isFirePending}
        isListenPending={isListenPending}
        isTextPending={isTextPending}
      />

      {schema && primaryParam && (
        <Accordion disableGutters>
          <AccordionSummary>
            <Typography variant="h6">Schema</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <TextField
                select
                label="Primary param"
                value={schema.primaryParamId}
                onChange={(event) =>
                  onSchemaChange({ ...schema, primaryParamId: event.target.value })
                }
              >
                {schema.params.map((param) => (
                  <MenuItem key={param.id} value={param.id}>
                    {param.label}
                  </MenuItem>
                ))}
              </TextField>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                useFlexGap
                sx={{ flexWrap: 'wrap' }}
              >
                {schema.params.map((param) => (
                  <TextField
                    key={param.id}
                    select
                    label={`Anchor ${param.label}`}
                    value={schema.anchorValues[param.id] ?? ''}
                    onChange={(event) =>
                      onSchemaChange({
                        ...schema,
                        anchorValues: { ...schema.anchorValues, [param.id]: event.target.value },
                      })
                    }
                    sx={{ minWidth: 160 }}
                  >
                    {param.options.map((option) => (
                      <MenuItem key={option.id} value={option.id}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                ))}
              </Stack>
              {primaryParam.options.map((primaryOption) => (
                <Stack key={primaryOption.id} spacing={1}>
                  <Typography variant="subtitle1">{primaryOption.label}</Typography>
                  {schema.params
                    .filter((param) => param.id !== schema.primaryParamId)
                    .map((param) => {
                      const constraint = constraintFor({
                        schema,
                        primaryOptionId: primaryOption.id,
                        paramId: param.id,
                      });
                      return (
                        <Stack
                          key={param.id}
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          useFlexGap
                          sx={{ alignItems: { sm: 'center' } }}
                        >
                          <TextField
                            select
                            label={param.label}
                            value={constraint.kind}
                            onChange={(event) =>
                              onSchemaChange(
                                setConstraint({
                                  schema,
                                  primaryOptionId: primaryOption.id,
                                  paramId: param.id,
                                  constraint: {
                                    kind: event.target.value as TrainerConstraint['kind'],
                                  },
                                }),
                              )
                            }
                            sx={{ minWidth: 180 }}
                          >
                            <MenuItem value="all">All options</MenuItem>
                            <MenuItem value="some">Some options</MenuItem>
                            <MenuItem value="off">Off</MenuItem>
                          </TextField>
                          {param.isSeparateCommand && (
                            <Typography color="text.secondary">Separate command</Typography>
                          )}
                          {constraint.kind === 'some' && (
                            <TextField
                              select
                              label={`${param.label} allowed`}
                              value={constraint.optionIds ?? []}
                              slotProps={{ select: { multiple: true } }}
                              onChange={(event) => {
                                const optionIds = event.target.value;
                                onSchemaChange(
                                  setConstraint({
                                    schema,
                                    primaryOptionId: primaryOption.id,
                                    paramId: param.id,
                                    constraint: {
                                      kind: 'some',
                                      optionIds: Array.isArray(optionIds) ? optionIds : [optionIds],
                                    },
                                  }),
                                );
                              }}
                              sx={{ minWidth: 220 }}
                            >
                              {param.options.map((option) => (
                                <MenuItem key={option.id} value={option.id}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          )}
                        </Stack>
                      );
                    })}
                </Stack>
              ))}
              <Button variant="contained" onClick={onSaveSchema} disabled={isSavePending}>
                Save schema
              </Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      <Accordion disableGutters>
        <AccordionSummary>
          <Typography variant="h6">Cycle (capture checklist)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            {capturePlan.map((step) => {
              const sample = sampleByStepId[step.id];
              const isNext = step.id === nextStepId;
              return (
                <Stack
                  key={step.id}
                  spacing={1}
                  sx={{
                    border: 1,
                    borderColor: isNext ? 'primary.main' : 'divider',
                    borderRadius: 1,
                    p: 1.5,
                  }}
                >
                  <Typography>
                    {sample ? 'Done' : isNext ? 'Next' : 'Queued'} · {step.label}
                  </Typography>
                  {sample && (
                    <Typography
                      sx={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 13,
                        wordBreak: 'break-all',
                      }}
                    >
                      {formatBits(sample.bits)} · {sample.source} · {sample.pulseCount} pulses
                    </Typography>
                  )}
                  <TextField
                    label="Paste bits, hex, base64, or pulses"
                    value={pasteByStepId[step.id] ?? ''}
                    onChange={(event) => onPasteChange(step.id, event.target.value)}
                    multiline
                    minRows={2}
                  />
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    <Button
                      variant="outlined"
                      onClick={() => onSubmitText(step)}
                      disabled={isTextPending || !(pasteByStepId[step.id] ?? '').trim()}
                    >
                      Save text
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => onListen(step)}
                      disabled={isListenPending}
                    >
                      {isListenPending ? 'Listening…' : 'Listen'}
                    </Button>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary>
          <Typography variant="h6">Fields</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Button variant="outlined" onClick={onInfer} disabled={isInferPending}>
              Infer from samples
            </Button>
            {inference ? (
              <>
                <Typography>
                  Checksum bits:{' '}
                  {inference.checksumIndexes.length > 0
                    ? inference.checksumIndexes.join(', ')
                    : 'none yet'}
                </Typography>
                {inference.unresolved.map((item) => (
                  <Alert key={item} severity="warning">
                    {item}
                  </Alert>
                ))}
                {inference.fields.map((field) => {
                  const paramLabel =
                    schema?.params.find((param) => param.id === field.paramId)?.label ??
                    field.paramId;
                  return (
                    <Stack key={field.paramId} spacing={0.5}>
                      <Typography>
                        {paramLabel} · {field.kind}
                        {field.bitIndexes.length > 0
                          ? ` · bits ${field.bitIndexes.join(', ')}`
                          : ''}
                      </Typography>
                      {field.unresolvedReason && (
                        <Typography color="text.secondary">{field.unresolvedReason}</Typography>
                      )}
                      {Object.entries(field.lookup).map(([optionId, bits]) => (
                        <Typography
                          key={optionId}
                          sx={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 13,
                          }}
                        >
                          {optionId}: {formatBits(bits)}
                        </Typography>
                      ))}
                    </Stack>
                  );
                })}
                {inference.disabledNotes.map((note) => {
                  const paramLabel =
                    schema?.params.find((param) => param.id === note.paramId)?.label ??
                    note.paramId;
                  const primaryLabel =
                    primaryParam?.options.find((option) => option.id === note.primaryOptionId)
                      ?.label ?? note.primaryOptionId;
                  return (
                    <Alert key={`${note.primaryOptionId}-${note.paramId}`} severity="info">
                      {primaryLabel} / {paramLabel}: {note.role}
                      {note.detail ? ` — ${note.detail}` : ''}
                    </Alert>
                  );
                })}
              </>
            ) : (
              <Typography color="text.secondary">
                Capture a few axis samples, then infer.
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
};
