import { ColorIonic, SectionProperties } from '@bk2/shared-models';
import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ROLE, DEFAULT_SECTION_TYPE, DEFAULT_TAGS, DEFAULT_TITLE } from '@bk2/shared-constants';

export type SectionFormModel = {
  bkey: string;
  name: string;
  tags: string;
  description: string;
  roleNeeded: string;
  color: ColorIonic;
  title: string;
  subTitle: string;
  type: string;
  properties: SectionProperties;
};

export const SECTION_FORM_SHAPE: SectionFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  tags: DEFAULT_TAGS,
  description: DEFAULT_NOTES,
  roleNeeded: DEFAULT_ROLE,
  color: ColorIonic.Primary,
  title: DEFAULT_TITLE,
  subTitle: DEFAULT_TITLE,
  type: DEFAULT_SECTION_TYPE,
  properties: {},
};
