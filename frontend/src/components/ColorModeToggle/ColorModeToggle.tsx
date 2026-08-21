import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { FC } from 'react';
import type { useColorModeToggle } from './useColorModeToggle';

type Props = ReturnType<typeof useColorModeToggle>;

export const ColorModeToggle: FC<Props> = ({ isDark, onToggle }) => {
  return (
    <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <IconButton color="inherit" onClick={onToggle} aria-label="Toggle color mode">
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
};
