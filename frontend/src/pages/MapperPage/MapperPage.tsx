import type { FC } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller } from 'react-hook-form';
import type { useMapperPage } from './useMapperPage';

type Props = ReturnType<typeof useMapperPage>;

const panePaperSx = {
  p: 2,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minHeight: 0,
  overflow: 'hidden',
} as const;

const paneScrollSx = {
  overflow: 'auto',
  minHeight: 0,
  flex: 1,
} as const;

export const MapperPage: FC<Props> = ({
  isCatalogLoading,
  catalogErrorMessage,
  remotes,
  selectedRemoteId,
  selectedRemote,
  onSelectRemote,
  devices,
  selectedDeviceId,
  selectedDevice,
  onSelectDevice,
  selectedTemplate,
  selectedButtonId,
  onSelectButton,
  onTestFire,
  isTestFirePending,
  createForm,
  onCreateDevice,
  onAssignSlot,
  onClearSlot,
  buttonById,
  isSavePending,
}) => {
  if (isCatalogLoading) {
    return <Typography>Loading catalog…</Typography>;
  }

  if (catalogErrorMessage) {
    return <Alert severity="error">{catalogErrorMessage}</Alert>;
  }

  if (remotes.length === 0) {
    return (
      <Alert severity="info">
        No catalog yet. Open Settings, set the API token, then export from Tuya Cloud.
      </Alert>
    );
  }

  return (
    <Stack spacing={3} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h4">Build HA remotes</Typography>
        <Typography color="text.secondary">
          Tuya names and order are untrusted. Test-fire a button, then drop it into an HA slot.
        </Typography>
      </Box>

      <Paper sx={{ p: 2, flexShrink: 0 }}>
        <Stack spacing={2}>
          <FormControl fullWidth>
            <InputLabel id="remote-label">Tuya remote (button catalog)</InputLabel>
            <Select
              labelId="remote-label"
              label="Tuya remote (button catalog)"
              value={selectedRemoteId}
              onChange={(event) => onSelectRemote(event.target.value)}
            >
              {remotes.map((remote) => (
                <MenuItem key={remote.remoteId} value={remote.remoteId}>
                  {remote.remoteName} ({remote.buttons.length} buttons)
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box
            component="form"
            onSubmit={onCreateDevice}
            sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
          >
            <TextField
              label="HA device name"
              {...createForm.register('name', { required: true })}
              sx={{ flexGrow: 1, minWidth: 200 }}
            />
            <Controller
              control={createForm.control}
              name="template"
              render={({ field }) => (
                <FormControl sx={{ minWidth: 180 }}>
                  <InputLabel id="template-label">Template</InputLabel>
                  <Select labelId="template-label" label="Template" {...field}>
                    <MenuItem value="fan">Fan</MenuItem>
                    <MenuItem value="tv">TV</MenuItem>
                    <MenuItem value="soundbar">Soundbar</MenuItem>
                    <MenuItem value="ac">Air conditioner</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
            <Button type="submit" variant="contained" disabled={isSavePending}>
              Create mapping
            </Button>
          </Box>

          {devices.length > 0 && (
            <FormControl fullWidth>
              <InputLabel id="device-label">HA mapping</InputLabel>
              <Select
                labelId="device-label"
                label="HA mapping"
                value={selectedDeviceId}
                onChange={(event) => onSelectDevice(event.target.value)}
              >
                {devices.map((device) => (
                  <MenuItem key={device.id} value={device.id}>
                    {device.name} ({device.template})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gridTemplateRows: { xs: 'minmax(0, 1fr) minmax(0, 1fr)', md: 'minmax(0, 1fr)' },
          gap: 2,
          flex: 1,
          minHeight: 0,
        }}
      >
        <Paper sx={panePaperSx}>
          <Typography variant="h6">Tuya buttons</Typography>
          <Stack spacing={1} sx={paneScrollSx}>
            {(selectedRemote?.buttons ?? []).map((button) => (
              <Box
                key={button.id}
                sx={{
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  p: 1,
                  borderRadius: 1,
                  bgcolor: selectedButtonId === button.id ? 'action.selected' : 'transparent',
                }}
              >
                <Button
                  size="small"
                  variant={selectedButtonId === button.id ? 'contained' : 'outlined'}
                  onClick={() => onSelectButton(button.id)}
                  sx={{ flexGrow: 1, justifyContent: 'flex-start' }}
                >
                  {button.keyName}
                </Button>
                {button.hasCode && <Chip size="small" label="raw" />}
                <Button
                  size="small"
                  onClick={() => onTestFire(button.id)}
                  disabled={isTestFirePending}
                >
                  Test
                </Button>
              </Box>
            ))}
          </Stack>
        </Paper>

        <Paper sx={panePaperSx}>
          <Typography variant="h6">
            HA slots {selectedDevice ? `— ${selectedDevice.name}` : ''}
          </Typography>
          <Stack spacing={1} sx={paneScrollSx}>
            {!selectedDevice && <Alert severity="info">Create or select a mapping.</Alert>}
            {selectedDevice?.template === 'tv' && (
              <Alert severity="info">
                Power, volume, mute, play/pause, and last HDMI go to Google as a TV. Home, d-pad,
                Netflix, settings, HDMI cycle, and the rest become Home Assistant buttons on the
                same device.
              </Alert>
            )}
            {(selectedTemplate?.slots ?? []).map((slot) => {
              const assignedButtonId = selectedDevice?.slots[slot.id]?.buttonId;
              return (
                <Box key={slot.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    onClick={() => onAssignSlot(slot.id)}
                    sx={{ flexGrow: 1, justifyContent: 'space-between' }}
                  >
                    <span>
                      {slot.label}
                      {slot.isRequired ? ' *' : ''}
                    </span>
                    <span>{assignedButtonId ? buttonById[assignedButtonId] : 'unassigned'}</span>
                  </Button>
                  {assignedButtonId && (
                    <Button size="small" onClick={() => onClearSlot(slot.id)}>
                      Clear
                    </Button>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
};
