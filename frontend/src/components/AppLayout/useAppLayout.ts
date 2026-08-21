import type { AppLayoutProps } from '.';

export const useAppLayout = (props: AppLayoutProps) => {
  return {
    children: props.children,
  };
};
