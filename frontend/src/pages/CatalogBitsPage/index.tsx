import type { FC } from 'react';
import { CatalogBitsPage as Component } from './CatalogBitsPage';
import { useCatalogBitsPage } from './useCatalogBitsPage';

export type CatalogBitsPageProps = Record<string, never>;

export const CatalogBitsPage: FC<CatalogBitsPageProps> = (props) => {
  const componentProps = useCatalogBitsPage(props);
  return <Component {...componentProps} />;
};
