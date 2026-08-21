import type { ColorModeToggleProps } from '.';
import { useColorScheme } from '@mui/material/styles';

export const useColorModeToggle = (_props: ColorModeToggleProps) => {
  const { mode, setMode } = useColorScheme();
  const isDark = mode === 'dark';

  const onToggle = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return {
    isDark,
    onToggle,
  };
};
