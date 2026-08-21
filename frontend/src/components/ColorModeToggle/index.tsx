import type { FC } from 'react';
import { ColorModeToggle as Component } from './ColorModeToggle';
import { useColorModeToggle } from './useColorModeToggle';

export type ColorModeToggleProps = Record<string, never>;

export const ColorModeToggle: FC<ColorModeToggleProps> = (props) => {
  const componentProps = useColorModeToggle(props);
  return <Component {...componentProps} />;
};
