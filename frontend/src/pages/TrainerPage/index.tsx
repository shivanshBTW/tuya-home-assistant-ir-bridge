import type { FC } from 'react';
import { TrainerPage as Component } from './TrainerPage';
import { useTrainerPage } from './useTrainerPage';

export type TrainerPageProps = Record<string, never>;

export const TrainerPage: FC<TrainerPageProps> = (props) => {
  const componentProps = useTrainerPage(props);
  return <Component {...componentProps} />;
};
