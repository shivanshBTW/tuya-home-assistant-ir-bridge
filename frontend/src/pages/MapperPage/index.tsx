import type { FC } from 'react';
import { MapperPage as Component } from './MapperPage';
import { useMapperPage } from './useMapperPage';

export type MapperPageProps = Record<string, never>;

export const MapperPage: FC<MapperPageProps> = (props) => {
  const componentProps = useMapperPage(props);
  return <Component {...componentProps} />;
};
