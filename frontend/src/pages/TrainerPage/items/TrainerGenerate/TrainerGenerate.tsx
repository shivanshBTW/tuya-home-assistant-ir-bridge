import type { FC } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { useTrainerPage } from '../../useTrainerPage';

type Props = Pick<
  ReturnType<typeof useTrainerPage>,
  | 'schema'
  | 'generation'
  | 'visibleGenerateCells'
  | 'generateFilter'
  | 'generateModeId'
  | 'pasteByCellId'
  | 'onGenerateFilterChange'
  | 'onGenerateModeChange'
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

export const TrainerGenerate: FC<Props> = ({
  schema,
  generation,
  visibleGenerateCells,
  generateFilter,
  generateModeId,
  pasteByCellId,
  onGenerateFilterChange,
  onGenerateModeChange,
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

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Generate</Typography>
        <Typography color="text.secondary">
          Ready cells can be sent. Empty cells need a capture — usually power saving, which uses a
          different packet.
        </Typography>
        <Button variant="contained" onClick={onGenerate} disabled={isGeneratePending}>
          {isGeneratePending ? 'Generating…' : 'Generate from samples'}
        </Button>
        {generation && (
          <>
            <Typography>
              Checksum: {generation.checksumKind.replace('_', ' ')} · {readyCount} ready ·{' '}
              {needsInputCount} need a capture
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
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
              <TextField
                select
                label="Mode"
                value={generateModeId}
                onChange={(event) => onGenerateModeChange(event.target.value)}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="">All modes</MenuItem>
                {primaryParam?.options.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {visibleGenerateCells.length === 0 && (
              <Typography color="text.secondary">Nothing in this filter.</Typography>
            )}
            {visibleGenerateCells.map((cell) => {
              const hasBits = Boolean(cell.bits);
              return (
                <Stack
                  key={cell.id}
                  spacing={1}
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}
                >
                  <Typography>
                    {hasBits ? (cell.status === 'captured' ? 'Captured' : 'Generated') : 'Empty'} ·{' '}
                    {cell.label}
                  </Typography>
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
                  {cell.needsInputReason && (
                    <Alert severity="warning">{cell.needsInputReason}</Alert>
                  )}
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
                      <Button
                        variant="contained"
                        onClick={() => onFireCell(cell)}
                        disabled={isFirePending}
                      >
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
            })}
          </>
        )}
      </Stack>
    </Paper>
  );
};
