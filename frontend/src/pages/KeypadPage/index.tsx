import type { FC } from 'react';
import { KeypadPage as Component } from './KeypadPage';
import { useKeypadPage } from './useKeypadPage';

export type KeypadPageProps = Record<string, never>;

export const KeypadPage: FC<KeypadPageProps> = (props) => {
  const componentProps = useKeypadPage(props);
  return <Component {...componentProps} />;
};
