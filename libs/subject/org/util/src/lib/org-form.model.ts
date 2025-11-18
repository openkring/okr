import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type OrgFormModel = DeepPartial<{
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
}>;

export const orgFormModelShape: DeepRequired<OrgFormModel> = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  type: DEFAULT_ORG_TYPE,
  dateOfFoundation: DEFAULT_DATE,
  dateOfLiquidation: DEFAULT_DATE,
  taxId: DEFAULT_ID,
  bexioId: DEFAULT_ID,
  membershipCategoryKey: DEFAULT_KEY,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,
};
