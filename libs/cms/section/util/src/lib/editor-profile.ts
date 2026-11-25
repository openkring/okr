import { ARTICLE_BLOCK_TYPES, MAIL_BLOCK_TYPES, type ArticleBlockType, type CalloutTone, type MailBlockType } from '@okr/shared-models';

import { CALLOUT_TONES, COLUMN_BLOCK_TYPES } from './article-block.util';
import type { ArticlePreviewDevice } from './article-block-view.util';

/** What the block editor offers for an article and for a Versand mail (spec 1.176 §8.2, §10). */
export interface EditorProfile {
  kind: 'article' | 'mail';
  /** what may stand on the top level, and what in a column */
  types: readonly MailBlockType[];
  columnTypes: readonly ArticleBlockType[];
  devices: readonly ArticlePreviewDevice[];
  /** the width of the canvas per device, in px */
  width: Partial<Record<ArticlePreviewDevice, number>>;
  /** left and right of the blocks inside that width, in px */
  padding: number;
  tones: readonly CalloutTone[];
  /** galleries are always rows of two: no layout and no slideshow */
  galleryPairs: boolean;
  /** what a click on a picture may do: everything, or only follow a link */
  imageAction: 'all' | 'link';
  /** columns may stack the other way round on the phone */
  stackReverse: boolean;
  /** placeholders (@APPNAME@) are replaced in the canvas */
  placeholders: boolean;
}

const COLUMN_TYPES = ARTICLE_BLOCK_TYPES.filter((type) => COLUMN_BLOCK_TYPES.includes(type));

export const ARTICLE_PROFILE: EditorProfile = {
  kind: 'article', types: ARTICLE_BLOCK_TYPES, columnTypes: COLUMN_TYPES, devices: ['mobile', 'tablet', 'desktop'], width: { mobile: 390, tablet: 768, desktop: 1100 }, padding: 0,
  tones: CALLOUT_TONES, galleryPairs: false, imageAction: 'all', stackReverse: true, placeholders: true,
};

/** 500 and 390 px with the 30 px of the seeded layouts inside: blocks are drawn at 440 and 330 px. No tablet, it would equal the desktop. */
export const MAIL_PROFILE: EditorProfile = {
  kind: 'mail', types: MAIL_BLOCK_TYPES, columnTypes: COLUMN_TYPES, devices: ['mobile', 'desktop'], width: { mobile: 390, desktop: 500 }, padding: 30,
  tones: ['primary', 'neutral'], galleryPairs: true, imageAction: 'link', stackReverse: false, placeholders: false,
};
