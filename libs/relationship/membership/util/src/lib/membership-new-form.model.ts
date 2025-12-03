import { getTodayStr } from '@bk2/shared-util-core';
import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME } from '@bk2/shared-constants';

export type MembershipNewFormModel = {
  memberKey: string,
  memberName1: string,    // firstName (not visible)
  memberName2: string,    // lastName (not visible)
  memberModelType: 'person' | 'org' | 'group',
  memberType: string,
  memberDateOfBirth: string,
  memberDateOfDeath: string,
  memberZipCode: string,
  memberBexioId: string,
  orgKey: string,
  orgName: string,
  dateOfEntry: string,     // the first day of the new membership
  membershipCategory: string,
  membershipCategoryAbbreviation: string      // we cache this to the form in order to avoid re-loading of the Category 
};

export const MEMBERSHIP_NEW_FORM_SHAPE: MembershipNewFormModel = {
  memberKey: DEFAULT_KEY,
  memberName1: DEFAULT_NAME,
  memberName2: DEFAULT_NAME,
  memberModelType: 'person',
  memberType: DEFAULT_GENDER,
  memberDateOfBirth: DEFAULT_DATE,
  memberDateOfDeath: DEFAULT_DATE,
  memberZipCode: '',
  memberBexioId: DEFAULT_ID,
  orgKey: DEFAULT_KEY,
  orgName: DEFAULT_NAME,
  dateOfEntry: getTodayStr(),
  membershipCategory: 'active',
  membershipCategoryAbbreviation: 'A'
};
 