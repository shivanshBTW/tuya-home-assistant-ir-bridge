import type { FC } from 'react';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { useSettingsPage } from './useSettingsPage';

type Props = ReturnType<typeof useSettingsPage>;

export const SettingsPage: FC<Props> = ({
  form,
  onSaveToken,
  onExport,
  isExportPending,
}) => {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Settings</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2} component="form" onSubmit={onSaveToken}>
          <Typography>
            The API token stays in this browser. It is not a Tuya secret and must match{' '}
            <code>API_TOKEN</code> on the backend.
          </Typography>
          <TextField
            label="API token"
            type="password"
            autoComplete="off"
            {...form.register('apiToken', { required: true })}
          />
          <Button type="submit" variant="contained">
            Save token
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography>
            Export pulls every trained Tuya button into a local catalog. Names and order are not
            used as HA slots.
          </Typography>
          <Button variant="outlined" onClick={onExport} disabled={isExportPending}>
            {isExportPending ? 'Exporting…' : 'Export Tuya catalog'}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
};
