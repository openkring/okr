import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { OrgType } from '@bk2/shared-models';

export type OrgNewFormModel = DeepPartial<{
  orgName: string,
  type: number,
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
  orgName: '',
  type: OrgType.Association,
  dateOfFoundation: '',
  dateOfLiquidation: '',
  streetName: '',
  streetNumber: '',
  zipCode: '',
  city: '',
  countryCode: '',
  phone: '',
  email: '',
  url: '',
  taxId: '',
  bexioId: '',
  membershipCategoryKey: '',
  tags: '',
  notes: ''
};
