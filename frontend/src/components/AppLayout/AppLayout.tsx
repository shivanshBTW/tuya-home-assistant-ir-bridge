import type { FC } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { Link as RouterLink } from 'react-router';
import { ColorModeToggle } from '../ColorModeToggle';
import type { useAppLayout } from './useAppLayout';

type Props = ReturnType<typeof useAppLayout>;

export const AppLayout: FC<Props> = ({ children }) => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Tuya HA IR Bridge
          </Typography>
          <Button color="inherit" component={RouterLink} to="/">
            Mapper
          </Button>
          <Button color="inherit" component={RouterLink} to="/keypad">
            Keypad
          </Button>
          <Button color="inherit" component={RouterLink} to="/settings">
            Settings
          </Button>
          <ColorModeToggle />
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3, flexGrow: 1 }}>
        {children}
      </Container>
    </Box>
  );
};
