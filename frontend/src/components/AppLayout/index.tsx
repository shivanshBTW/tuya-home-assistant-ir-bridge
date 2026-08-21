import type { FC, ReactNode } from 'react';
import { AppLayout as Component } from './AppLayout';
import { useAppLayout } from './useAppLayout';

export interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: FC<AppLayoutProps> = (props) => {
  const componentProps = useAppLayout(props);
  return <Component {...componentProps} />;
};
