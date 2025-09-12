import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { GenderType } from '@bk2/shared-models';
import { getTodayStr } from '@bk2/shared-util-core';

export type PersonNewFormModel = DeepPartial<{
  firstName: string,
  lastName: string,
  gender: GenderType,
  dateOfBirth: string,
  dateOfDeath: string,
  ssnId: string,
  bexioId: string

  street: string,
  zipCode: string,
  city: string,
  countryCode: string,
  phone: string,
  email: string,
  web: string,

  // membership
  shouldAddMembership: boolean,
  orgKey: string,
  orgName: string,
  membershipCategory: string,
  membershipCategoryAbbreviation: string      // we cache this to the form in order to avoid re-loading of the Category 
  dateOfEntry: string,

  notes: string,
  tags: string,
}>;

export const personNewFormModelShape: DeepRequired<PersonNewFormModel> = {
  firstName: '',
  lastName: '',
  gender: GenderType.Male,
  dateOfBirth: '',
  dateOfDeath: '',
  ssnId: '',
  bexioId: '',

  // address
  street: '',
  zipCode: '',
  city: '',
  countryCode: 'CH',
  phone: '',
  email: '',
  web: '',

  // membership
  shouldAddMembership: false,
  orgKey: '',
  orgName: '',
  membershipCategory: '',
  membershipCategoryAbbreviation: 'A',
  dateOfEntry: getTodayStr(),

  notes: '',
  tags: '',
};