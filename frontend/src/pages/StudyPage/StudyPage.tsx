import type { FC } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { useStudyPage } from './useStudyPage';

type Props = ReturnType<typeof useStudyPage>;

const captureOptionLabel = ({
  receivedAt,
  pulseCount,
  label,
}: {
  receivedAt: string;
  pulseCount: number;
  label?: string;
}): string => {
  const time = receivedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
  return label ? `${time} — ${label}` : `${time} — ${pulseCount} pulses`;
};

export const StudyPage: FC<Props> = ({
  form,
  selectedCaptureId,
  logText,
  log,
  savedButtons,
  selectedCapture,
  compareCaptureId,
  diffs,
  onListen,
  onSave,
  onReplay,
  isListenPending,
  isSavePending,
  isReplayPending,
  isLoading,
}) => {
  const labelByCaptureId = Object.fromEntries(
    savedButtons.map((button) => [button.captureId, button.label]),
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Study</Typography>
      <Typography color="text.secondary">
        Local-only reader. Arm the blaster, press one LG key, then name and replay the frame. The
        log never clears.
      </Typography>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Button variant="contained" onClick={onListen} disabled={isListenPending}>
            {isListenPending ? 'Listening… point the LG remote' : 'Listen'}
          </Button>
          <TextField
            label="Capture log"
            value={isLoading ? 'Loading study log…' : logText}
            multiline
            minRows={8}
            slotProps={{ input: { readOnly: true } }}
          />
          <Button
            variant="outlined"
            disabled={!selectedCapture || isReplayPending || isListenPending}
            onClick={() => selectedCapture && onReplay(selectedCapture.id)}
          >
            Replay selected capture
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2} component="form" onSubmit={onSave}>
          <Typography variant="h6">Save named button</Typography>
          <TextField
            select
            label="Capture"
            value={selectedCaptureId}
            onChange={(event) => form.setValue('captureId', event.target.value)}
          >
            {log.map((capture) => (
              <MenuItem key={capture.id} value={capture.id}>
                {captureOptionLabel({
                  receivedAt: capture.receivedAt,
                  pulseCount: capture.pulseCount,
                  label: labelByCaptureId[capture.id],
                })}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Label" {...form.register('label', { required: true })} />
          <TextField label="Notes" multiline minRows={2} {...form.register('notes')} />
          <Button type="submit" variant="contained" disabled={isSavePending || log.length === 0}>
            Save to study.json
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Custom buttons</Typography>
          {savedButtons.length === 0 && (
            <Typography color="text.secondary">No named buttons yet.</Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {savedButtons.map((button) => (
              <Button
                key={button.id}
                variant="outlined"
                disabled={isReplayPending || isListenPending}
                onClick={() => onReplay(button.captureId)}
              >
                {button.label}
              </Button>
            ))}
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h6">Decode</Typography>
          {selectedCapture ? (
            <>
              <Typography>
                Kind <code>{selectedCapture.decode.kind}</code> · {selectedCapture.decode.pulseCount}{' '}
                pulses
              </Typography>
              <TextField
                label="Hex"
                value={selectedCapture.decode.hex}
                multiline
                minRows={2}
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                label="Base64"
                value={selectedCapture.decode.base64 || selectedCapture.code}
                multiline
                minRows={2}
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                label="Pulses (µs)"
                value={selectedCapture.decode.pulses.join(' ')}
                multiline
                minRows={3}
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                select
                label="Compare with"
                value={compareCaptureId}
                onChange={(event) => form.setValue('compareCaptureId', event.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                {log
                  .filter((capture) => capture.id !== selectedCapture.id)
                  .map((capture) => (
                    <MenuItem key={capture.id} value={capture.id}>
                      {captureOptionLabel({
                        receivedAt: capture.receivedAt,
                        pulseCount: capture.pulseCount,
                        label: labelByCaptureId[capture.id],
                      })}
                    </MenuItem>
                  ))}
              </TextField>
              {diffs.length > 0 && (
                <TextField
                  label={`Pulse diffs (${diffs.length})`}
                  value={diffs
                    .map(
                      (diff) =>
                        `${diff.index}: ${diff.left ?? '—'} → ${diff.right ?? '—'}`,
                    )
                    .join('\n')}
                  multiline
                  minRows={4}
                  slotProps={{ input: { readOnly: true } }}
                />
              )}
            </>
          ) : (
            <Typography color="text.secondary">Select a capture to inspect pulses.</Typography>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
};
