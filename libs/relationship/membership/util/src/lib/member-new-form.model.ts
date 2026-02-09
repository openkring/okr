import { getTodayStr } from '@bk2/shared-util-core';

export type MemberNewFormModel = {
  firstName: string,
  lastName: string,
  gender: string,
  dateOfBirth: string,
  dateOfDeath: string,
  ssnId: string,
  bexioId: string

  streetName: string,
  streetNumber: string,
  zipCode: string,
  city: string,
  countryCode: string,
  phone: string,
  email: string,
  web: string,

  orgKey: string,
  orgName: string,
  membershipCategory: string,
  membershipCategoryAbbreviation: string      // we cache this to the form in order to avoid re-loading of the Category 
  dateOfEntry: string,

  notes: string,
  tags: string,
};

export const MEMBER_NEW_FORM_SHAPE: MemberNewFormModel = {
  firstName: '',
  lastName: '',
  gender: 'female',
  dateOfBirth: '',
  dateOfDeath: '',
  ssnId: '',
  bexioId: '',

  // address
  streetName: '',
  streetNumber: '',
  zipCode: '',
  city: '',
  countryCode: 'CH',
  phone: '',
  email: '',
  web: '',

  // membership
  orgKey: '',
  orgName: '',
  membershipCategory: '',
  membershipCategoryAbbreviation: 'A',
  dateOfEntry: getTodayStr(),

  notes: '',
  tags: '',
};