import type { FC } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { TrainerGeneratedCell, TrainerSchema } from '../../../../libs/services/types';
import type { useTrainerPage } from '../../useTrainerPage';

type Props = Pick<
  ReturnType<typeof useTrainerPage>,
  | 'schema'
  | 'generation'
  | 'visibleGenerateCells'
  | 'commandCells'
  | 'generateFilter'
  | 'pickerModeId'
  | 'pickerTempOptionIds'
  | 'pickerSpeedOptionIds'
  | 'selectedTempId'
  | 'selectedSpeedId'
  | 'selectedFrameCell'
  | 'pasteByCellId'
  | 'onGenerateFilterChange'
  | 'onGenerateModeChange'
  | 'onSelectedTempChange'
  | 'onSelectedSpeedChange'
  | 'onPasteCellChange'
  | 'onGenerate'
  | 'onFireCell'
  | 'onListenCell'
  | 'onSubmitCellText'
  | 'isGeneratePending'
  | 'isFirePending'
  | 'isListenPending'
  | 'isTextPending'
>;

const formatBits = (bits: string): string => bits.match(/.{1,4}/g)?.join(' ') ?? bits;

const optionLabel = ({
  schema,
  paramId,
  optionId,
}: {
  schema?: TrainerSchema;
  paramId: string;
  optionId: string;
}): string => {
  return (
    schema?.params
      .find((param) => param.id === paramId)
      ?.options.find((option) => option.id === optionId)?.label ?? optionId
  );
};

const CellActions: FC<{
  cell: TrainerGeneratedCell;
  pasteByCellId: Record<string, string>;
  onPasteCellChange: (cellId: string, text: string) => void;
  onFireCell: (cell: TrainerGeneratedCell) => void;
  onListenCell: (cell: TrainerGeneratedCell) => void;
  onSubmitCellText: (cell: TrainerGeneratedCell) => void;
  isFirePending: boolean;
  isListenPending: boolean;
  isTextPending: boolean;
}> = ({
  cell,
  pasteByCellId,
  onPasteCellChange,
  onFireCell,
  onListenCell,
  onSubmitCellText,
  isFirePending,
  isListenPending,
  isTextPending,
}) => {
  const hasBits = Boolean(cell.bits);
  return (
    <Stack spacing={1}>
      {cell.bits && (
        <Typography
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            wordBreak: 'break-all',
          }}
        >
          {formatBits(cell.bits)}
        </Typography>
      )}
      {cell.needsInputReason && <Alert severity="warning">{cell.needsInputReason}</Alert>}
      {!hasBits && (
        <TextField
          label="Paste bits, hex, base64, or pulses"
          value={pasteByCellId[cell.id] ?? ''}
          onChange={(event) => onPasteCellChange(cell.id, event.target.value)}
          multiline
          minRows={2}
        />
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {hasBits && (
          <Button variant="contained" onClick={() => onFireCell(cell)} disabled={isFirePending}>
            Send
          </Button>
        )}
        {!hasBits && (
          <>
            <Button
              variant="outlined"
              onClick={() => onSubmitCellText(cell)}
              disabled={isTextPending || !(pasteByCellId[cell.id] ?? '').trim()}
            >
              Save text
            </Button>
            <Button
              variant="contained"
              onClick={() => onListenCell(cell)}
              disabled={isListenPending}
            >
              {isListenPending ? 'Listening…' : 'Listen'}
            </Button>
          </>
        )}
      </Stack>
    </Stack>
  );
};

export const TrainerGenerate: FC<Props> = ({
  schema,
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
  pasteByCellId,
  onGenerateFilterChange,
  onGenerateModeChange,
  onSelectedTempChange,
  onSelectedSpeedChange,
  onPasteCellChange,
  onGenerate,
  onFireCell,
  onListenCell,
  onSubmitCellText,
  isGeneratePending,
  isFirePending,
  isListenPending,
  isTextPending,
}) => {
  const readyCount = generation?.cells.filter((cell) => cell.bits).length ?? 0;
  const needsInputCount =
    generation?.cells.filter((cell) => cell.status === 'needs_input').length ?? 0;
  const primaryParam = schema?.params.find((param) => param.id === schema.primaryParamId);
  const generatedTempCount = pickerTempOptionIds.length;

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Remote</Typography>
        <Typography color="text.secondary">
          Pick any generated combo and send it. Temp should list every degree we can build, not only
          the ones you captured.
        </Typography>
        <Button variant="contained" onClick={onGenerate} disabled={isGeneratePending}>
          {isGeneratePending ? 'Generating…' : 'Generate from samples'}
        </Button>
        {!generation && (
          <Alert severity="info">
            Restart the backend if this stays empty, then click Generate from samples.
          </Alert>
        )}
        {generation && (
          <>
            <Typography>
              Checksum: {generation.checksumKind.replaceAll('_', ' ')} · {readyCount} ready ·{' '}
              {needsInputCount} need a capture
              {generatedTempCount > 0 ? ` · ${generatedTempCount} temps in this mode` : ''}
            </Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap' }}
            >
              <TextField
                select
                label="Mode"
                value={pickerModeId}
                onChange={(event) => onGenerateModeChange(event.target.value)}
                sx={{ minWidth: 160 }}
              >
                {primaryParam?.options.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {pickerTempOptionIds.length > 0 && (
                <TextField
                  select
                  label="Temp"
                  value={selectedTempId}
                  onChange={(event) => onSelectedTempChange(event.target.value)}
                  sx={{ minWidth: 140 }}
                >
                  {pickerTempOptionIds.map((optionId) => (
                    <MenuItem key={optionId} value={optionId}>
                      {optionLabel({ schema, paramId: 'temp', optionId })}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {pickerSpeedOptionIds.length > 0 && (
                <TextField
                  select
                  label="Speed"
                  value={selectedSpeedId}
                  onChange={(event) => onSelectedSpeedChange(event.target.value)}
                  sx={{ minWidth: 140 }}
                >
                  {pickerSpeedOptionIds.map((optionId) => (
                    <MenuItem key={optionId} value={optionId}>
                      {optionLabel({ schema, paramId: 'speed', optionId })}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
            {selectedFrameCell ? (
              <Stack
                spacing={1}
                sx={{ border: 1, borderColor: 'primary.main', borderRadius: 1, p: 1.5 }}
              >
                <Typography>
                  {selectedFrameCell.bits ? 'Ready' : 'Needs capture'} · {selectedFrameCell.label}
                </Typography>
                <CellActions
                  cell={selectedFrameCell}
                  pasteByCellId={pasteByCellId}
                  onPasteCellChange={onPasteCellChange}
                  onFireCell={onFireCell}
                  onListenCell={onListenCell}
                  onSubmitCellText={onSubmitCellText}
                  isFirePending={isFirePending}
                  isListenPending={isListenPending}
                  isTextPending={isTextPending}
                />
              </Stack>
            ) : (
              <Alert severity="warning">No generated combo for this selection yet.</Alert>
            )}
            {commandCells.length > 0 && (
              <Stack spacing={2}>
                {commandCells.some((cell) => cell.paramValues.powerSaving) && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">Power saving (separate command)</Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      {commandCells
                        .filter((cell) => cell.paramValues.powerSaving)
                        .map((cell) => {
                          const optionId = cell.paramValues.powerSaving ?? '';
                          return (
                            <Button
                              key={cell.id}
                              variant={cell.bits ? 'contained' : 'outlined'}
                              onClick={() => (cell.bits ? onFireCell(cell) : onListenCell(cell))}
                              disabled={cell.bits ? isFirePending : isListenPending}
                            >
                              {optionLabel({ schema, paramId: 'powerSaving', optionId })}
                              {cell.bits ? '' : ' · capture'}
                            </Button>
                          );
                        })}
                    </Stack>
                    {commandCells
                      .filter(
                        (cell) => cell.paramValues.powerSaving && cell.status === 'needs_input',
                      )
                      .map((cell) => (
                        <CellActions
                          key={`${cell.id}-input`}
                          cell={cell}
                          pasteByCellId={pasteByCellId}
                          onPasteCellChange={onPasteCellChange}
                          onFireCell={onFireCell}
                          onListenCell={onListenCell}
                          onSubmitCellText={onSubmitCellText}
                          isFirePending={isFirePending}
                          isListenPending={isListenPending}
                          isTextPending={isTextPending}
                        />
                      ))}
                  </Stack>
                )}
                {commandCells.some((cell) => cell.paramValues.power) && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">Power (Google / HA)</Typography>
                    <Alert severity="info">
                      Capture On and Off. Google turns the unit on with On, then the mode/temp/fan
                      frame. Off is its own packet.
                    </Alert>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      {commandCells
                        .filter((cell) => cell.paramValues.power)
                        .map((cell) => {
                          const optionId = cell.paramValues.power ?? '';
                          return (
                            <Button
                              key={cell.id}
                              variant={cell.bits ? 'contained' : 'outlined'}
                              onClick={() => (cell.bits ? onFireCell(cell) : onListenCell(cell))}
                              disabled={cell.bits ? isFirePending : isListenPending}
                            >
                              {optionLabel({ schema, paramId: 'power', optionId })}
                              {cell.bits ? '' : ' · capture'}
                            </Button>
                          );
                        })}
                    </Stack>
                    {commandCells
                      .filter((cell) => cell.paramValues.power && cell.status === 'needs_input')
                      .map((cell) => (
                        <CellActions
                          key={`${cell.id}-input`}
                          cell={cell}
                          pasteByCellId={pasteByCellId}
                          onPasteCellChange={onPasteCellChange}
                          onFireCell={onFireCell}
                          onListenCell={onListenCell}
                          onSubmitCellText={onSubmitCellText}
                          isFirePending={isFirePending}
                          isListenPending={isListenPending}
                          isTextPending={isTextPending}
                        />
                      ))}
                  </Stack>
                )}
              </Stack>
            )}
            <Accordion disableGutters>
              <AccordionSummary>
                <Typography>All generated combos ({visibleGenerateCells.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField
                    select
                    label="Show"
                    value={generateFilter}
                    onChange={(event) =>
                      onGenerateFilterChange(event.target.value as typeof generateFilter)
                    }
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="ready">Ready to send</MenuItem>
                    <MenuItem value="needs_input">Needs capture</MenuItem>
                    <MenuItem value="all">All combos</MenuItem>
                  </TextField>
                  {visibleGenerateCells.length === 0 && (
                    <Typography color="text.secondary">Nothing in this filter.</Typography>
                  )}
                  {visibleGenerateCells.map((cell) => (
                    <Stack
                      key={cell.id}
                      spacing={1}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                    >
                      <Typography>
                        {cell.bits
                          ? cell.status === 'captured'
                            ? 'Captured'
                            : 'Generated'
                          : 'Empty'}{' '}
                        · {cell.label}
                      </Typography>
                      <CellActions
                        cell={cell}
                        pasteByCellId={pasteByCellId}
                        onPasteCellChange={onPasteCellChange}
                        onFireCell={onFireCell}
                        onListenCell={onListenCell}
                        onSubmitCellText={onSubmitCellText}
                        isFirePending={isFirePending}
                        isListenPending={isListenPending}
                        isTextPending={isTextPending}
                      />
                    </Stack>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          </>
        )}
      </Stack>
    </Paper>
  );
};
