import { DEFAULT_CITY, DEFAULT_COUNTRY, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PHONE, DEFAULT_STREETNAME, DEFAULT_STREETNUMBER, DEFAULT_TAGS, DEFAULT_URL, DEFAULT_ZIP } from '@bk2/shared-constants';

export type OrgNewFormModel = {
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
};

export const ORG_NEW_FORM_SHAPE: OrgNewFormModel = {
  name: DEFAULT_NAME,
  type: DEFAULT_ORG_TYPE,
  dateOfFoundation: DEFAULT_DATE,
  dateOfLiquidation: DEFAULT_DATE,
  streetName: DEFAULT_STREETNAME,
  streetNumber: DEFAULT_STREETNUMBER,
  zipCode: DEFAULT_ZIP,
  city: DEFAULT_CITY,
  countryCode: DEFAULT_COUNTRY,
  phone: DEFAULT_PHONE,
  email: DEFAULT_EMAIL,
  url: DEFAULT_URL,
  taxId: DEFAULT_ID,
  bexioId: DEFAULT_ID,
  membershipCategoryKey: 'mcat_default',
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES
};
