import { GenderType, ModelType, OrgType } from '@bk2/shared/models';
import { getTodayStr } from '@bk2/shared/util';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type MembershipNewFormModel = DeepPartial<{
  memberKey: string,
  memberName1: string,    // firstName (not visible)
  memberName2: string,    // lastName (not visible)
  memberName: string,    // firstName lastName or orgName
  memberModelType: ModelType,
  memberType?: GenderType | OrgType,
  memberDateOfBirth: string,
  memberDateOfDeath: string,
  memberZipCode: string,
  memberBexioId: string,
  orgKey: string,
  orgName: string,
  dateOfEntry: string,     // the first day of the new membership
  membershipCategory: string,
  membershipCategoryAbbreviation: string      // we cache this to the form in order to avoid re-loading of the Category 
}>;

export const membershipNewFormModelShape: DeepRequired<MembershipNewFormModel> = {
  memberKey: '',
  memberName1: '',
  memberName2: '',
  memberName: '',
  memberModelType: ModelType.Person,
  memberType: GenderType.Male,
  memberDateOfBirth: '',
  memberDateOfDeath: '',
  memberZipCode: '',
  memberBexioId: '',
  orgKey: '',
  orgName: '',
  dateOfEntry: getTodayStr(),
  membershipCategory: 'active',
  membershipCategoryAbbreviation: 'A'
};
 