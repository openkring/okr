import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS } from '@bk2/shared-constants';

export type MembershipFormModel = DeepPartial<{
  bkey: string,
  tags: string,
  notes: string

  memberKey: string,      // bkey
  memberName1: string,    // firstName
  memberName2: string,    // lastName
  memberModelType: 'person' | 'org' | 'group', 
  memberType: string,
  memberNickName: string,
  memberAbbreviation: string,
  memberDateOfBirth: string,
  memberDateOfDeath: string,
  memberZipCode: string,
  memberBexioId: string,

  orgKey: string,
  orgName: string,

  memberId: string,
  dateOfEntry: string,
  dateOfExit: string,
  membershipCategory: string,
  orgFunction: string,

  order: number,
  relLog: string,
  relIsLast: boolean,

  price: number,
  currency: string,
  periodicity: string
}>;

export const membershipFormModelShape: DeepRequired<MembershipFormModel> = {
  bkey: DEFAULT_KEY,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,
  memberKey: DEFAULT_KEY,
  memberName1: DEFAULT_NAME,
  memberName2: DEFAULT_NAME,
  memberModelType: 'person',
  memberType: DEFAULT_GENDER,
  memberNickName: DEFAULT_NAME,
  memberAbbreviation: '',
  memberDateOfBirth: DEFAULT_DATE,
  memberDateOfDeath: DEFAULT_DATE,
  memberZipCode: '',
  memberBexioId: DEFAULT_ID,
  orgKey: DEFAULT_KEY,
  orgName: DEFAULT_NAME,
  memberId: DEFAULT_ID,
  dateOfEntry: DEFAULT_DATE,
  dateOfExit: DEFAULT_DATE,
  membershipCategory: 'active',
  orgFunction: '',
  order: 0,
  relLog: '',
  relIsLast: true,
  price: DEFAULT_PRICE,
  currency: DEFAULT_CURRENCY,
  periodicity: 'yearly'
};
 