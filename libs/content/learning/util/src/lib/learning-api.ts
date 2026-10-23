import type { DocumentLink } from '@okr/shared-models';

import type { LearningTab } from './learning-classify';

/** One item of a learning room as the public page API delivers it (functions, data-access, website). */
export interface PublicLearningItem {
  key: string;
  tab: LearningTab;
  title: string;
  tags: string[];
  notes: string;
  links: DocumentLink[];
  url: string;
  posterUrl?: string;
}

/** The learning section in the public page API. */
export interface PublicLearningSection {
  type: 'learning';
  title: string;
  subTitle: string;
  locked: boolean;
  /** the room's configured start tab (section config `defaultTab`); renderers fall back to the first non-empty tab */
  defaultTab: LearningTab;
  topics: string[];
  items: PublicLearningItem[];
}
