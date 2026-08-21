import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'material-react-toastify';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { KeypadPage } from './pages/KeypadPage';
import { MapperPage } from './pages/MapperPage';
import { SettingsPage } from './pages/SettingsPage';
import { ColorModeProvider } from './theme/ColorModeProvider';

const queryClient = new QueryClient();

export const App = () => {
  return (
    <ColorModeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<MapperPage />} />
              <Route path="/keypad" element={<KeypadPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
        <ToastContainer position="bottom-right" />
      </QueryClientProvider>
    </ColorModeProvider>
  );
};
