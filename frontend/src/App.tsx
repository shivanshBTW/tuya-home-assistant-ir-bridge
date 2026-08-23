import Box from '@mui/material/Box';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'material-react-toastify';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { KeypadPage } from './pages/KeypadPage';
import { MapperPage } from './pages/MapperPage';
import { SettingsPage } from './pages/SettingsPage';
import { CatalogBitsPage } from './pages/CatalogBitsPage';
import { StudyPage } from './pages/StudyPage';
import { ColorModeProvider } from './theme/ColorModeProvider';

const queryClient = new QueryClient();

export const App = () => {
  return (
    <ColorModeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppLayout>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                position: 'relative',
                overflow: 'auto',
              }}
            >
              <Routes>
                <Route path="/" element={<MapperPage />} />
                <Route path="/keypad" element={<KeypadPage />} />
                <Route path="/study" element={<StudyPage />} />
                <Route path="/bits" element={<CatalogBitsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </Box>
          </AppLayout>
        </BrowserRouter>
        <ToastContainer position="bottom-right" />
      </QueryClientProvider>
    </ColorModeProvider>
  );
};
