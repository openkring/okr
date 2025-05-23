import { GenderType, ModelType, OrgType, Periodicity } from '@bk2/shared/models';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type MembershipFormModel = DeepPartial<{
  bkey: string,
  tags: string,
  notes: string

  memberKey: string,      // bkey
  memberName1: string,    // firstName
  memberName2: string,    // lastName
  memberModelType: ModelType, 
  memberType: GenderType | OrgType,
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

  priority: number,
  relLog: string,
  relIsLast: boolean,

  price: number,
  currency: string,
  periodicity: number
}>;

export const membershipFormModelShape: DeepRequired<MembershipFormModel> = {
  bkey: '',
  tags: '',
  notes: '',
  memberKey: '',
  memberName1: '',
  memberName2: '',
  memberModelType: ModelType.Person,
  memberType: GenderType.Male,
  memberNickName: '',
  memberAbbreviation: '',
  memberDateOfBirth: '',
  memberDateOfDeath: '',
  memberZipCode: '',
  memberBexioId: '',
  orgKey: '',
  orgName: '',
  memberId: '',
  dateOfEntry: '',
  dateOfExit: '',
  membershipCategory: 'active',
  orgFunction: '',
  priority: 0,
  relLog: '',
  relIsLast: true,
  price: 0,
  currency: 'CHF',
  periodicity: Periodicity.Yearly
};
 