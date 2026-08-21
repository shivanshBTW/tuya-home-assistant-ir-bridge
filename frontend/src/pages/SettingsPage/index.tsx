import type { FC } from 'react';
import { SettingsPage as Component } from './SettingsPage';
import { useSettingsPage } from './useSettingsPage';

export type SettingsPageProps = Record<string, never>;

export const SettingsPage: FC<SettingsPageProps> = (props) => {
  const componentProps = useSettingsPage(props);
  return <Component {...componentProps} />;
};
