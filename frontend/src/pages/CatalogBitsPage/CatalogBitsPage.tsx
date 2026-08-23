import type { FC } from 'react';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getButtonDisplayName } from '../../libs/buttonLabel';
import type { useCatalogBitsPage } from './useCatalogBitsPage';

type Props = ReturnType<typeof useCatalogBitsPage>;

const formatBits = (bits: string): string => bits.match(/.{1,4}/g)?.join(' ') ?? bits;

const remoteOptionLabel = ({
  remoteId,
  remoteName,
  buttonCount,
}: {
  remoteId: string;
  remoteName?: string;
  buttonCount: number;
}): string => {
  return `${remoteName || remoteId} (${buttonCount})`;
};

export const CatalogBitsPage: FC<Props> = ({
  remotes,
  selectedRemoteId,
  remoteName,
  buttons,
  onSelectRemote,
  isLoading,
  errorMessage,
}) => {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Bits</Typography>
      <Typography color="text.secondary">
        Catalog buttons for {remoteName || 'the selected remote'}, with decoded pulse bits. Raw IR
        codes stay on the server.
      </Typography>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            select
            label="Remote"
            value={selectedRemoteId}
            onChange={(event) => onSelectRemote(event.target.value)}
            disabled={isLoading || remotes.length === 0}
          >
            {remotes.map((remote) => (
              <MenuItem key={remote.remoteId} value={remote.remoteId}>
                {remoteOptionLabel(remote)}
              </MenuItem>
            ))}
          </TextField>
          {isLoading && <Typography color="text.secondary">Loading catalog bits…</Typography>}
          {!isLoading && remotes.length === 0 && !errorMessage && (
            <Typography color="text.secondary">
              No catalog yet. Export from Settings first.
            </Typography>
          )}
          {buttons.map((button) => (
            <Stack key={button.id} spacing={0.5}>
              <Typography>
                {getButtonDisplayName(button)}{' '}
                <Typography component="span" color="text.secondary">
                  · {button.kind} · {button.pulseCount} pulses
                </Typography>
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  wordBreak: 'break-all',
                }}
              >
                {button.bits ? formatBits(button.bits) : 'no pulse bits'}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
};
