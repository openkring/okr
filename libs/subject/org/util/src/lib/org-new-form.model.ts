import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_URL } from '@bk2/shared-constants';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type OrgNewFormModel = DeepPartial<{
  name: string,
  type: string,
  dateOfFoundation: string,
  dateOfLiquidation: string,
  streetName: string,
  streetNumber: string,
  zipCode: string,
  city: string,
  countryCode: string,
  phone: string,
  email: string,
  url: string,
  taxId: string,
  bexioId: string,
  membershipCategoryKey: string,
  tags: string,
  notes: string
}>;

export const orgNewFormModelShape: DeepRequired<OrgNewFormModel> = {
  name: DEFAULT_NAME,
  type: DEFAULT_ORG_TYPE,
  dateOfFoundation: DEFAULT_DATE,
  dateOfLiquidation: DEFAULT_DATE,
  streetName: DEFAULT_NAME,
  streetNumber: '',
  zipCode: '',
  city: '',
  countryCode: '',
  phone: DEFAULT_PHONE,
  email: DEFAULT_EMAIL,
  url: DEFAULT_URL,
  taxId: DEFAULT_ID,
  bexioId: DEFAULT_ID,
  membershipCategoryKey: DEFAULT_KEY,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES
};
