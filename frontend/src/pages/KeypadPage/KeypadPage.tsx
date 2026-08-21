import type { FC } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getButtonDisplayName } from '../../libs/buttonLabel';
import type { useKeypadPage } from './useKeypadPage';

type Props = ReturnType<typeof useKeypadPage>;

export const KeypadPage: FC<Props> = ({
  leftoverButtons,
  onTestFire,
  isTestFirePending,
  isLoading,
}) => {
  if (isLoading) {
    return <Typography>Loading leftover buttons…</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Leftover keypad</Typography>
      <Typography color="text.secondary">
        Buttons that are not assigned to an HA slot. These are not exposed to Google Home.
      </Typography>
      <Paper sx={{ p: 2 }}>
        {leftoverButtons.length === 0 && <Typography>Every catalog button is mapped.</Typography>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {leftoverButtons.map((button) => (
            <Button
              key={button.id}
              variant="outlined"
              disabled={isTestFirePending}
              onClick={() => onTestFire(button.id)}
            >
              {button.remoteName}: {getButtonDisplayName(button)}
            </Button>
          ))}
        </Box>
      </Paper>
    </Stack>
  );
};
