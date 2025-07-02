
import { SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { dateValidations, stringValidations } from '@bk2/shared/util-core';
import { only, staticSuite} from 'vest';
import { MembershipNewFormModel } from './membership-new-form.model';

export const membershipNewFormValidations = staticSuite((model: MembershipNewFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('memberKey', model.memberKey, SHORT_NAME_LENGTH);
  stringValidations('memberName', model.memberName, SHORT_NAME_LENGTH);
  // memberModelType
  stringValidations('orgKey', model.orgName, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH);
  dateValidations('dateOfEntry', model.dateOfEntry);
  stringValidations('membershipCategory', model.membershipCategory, SHORT_NAME_LENGTH, 4, true); 
});



