import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';

export type OrgFormModel = {
  bkey: string;
  name: string;
  type: string;
  dateOfFoundation: string;
  dateOfLiquidation: string;
  taxId: string;
  bexioId: string;
  membershipCategoryKey: string;
  tags: string;
  notes: string;
};

export const ORG_FORM_SHAPE: OrgFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  type: DEFAULT_ORG_TYPE,
  dateOfFoundation: DEFAULT_DATE,
  dateOfLiquidation: DEFAULT_DATE,
  taxId: DEFAULT_ID,
  bexioId: DEFAULT_ID,
  membershipCategoryKey: 'mcat_default',
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,
};
