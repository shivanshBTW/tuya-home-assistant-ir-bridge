import type { FC } from 'react';
import { StudyPage as Component } from './StudyPage';
import { useStudyPage } from './useStudyPage';

export type StudyPageProps = Record<string, never>;

export const StudyPage: FC<StudyPageProps> = (props) => {
  const componentProps = useStudyPage(props);
  return <Component {...componentProps} />;
};
