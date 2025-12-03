
import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { dateValidations, stringValidations } from '@bk2/shared-util-core';

import { MembershipNewFormModel } from './membership-new-form.model';

export const membershipNewFormValidations = staticSuite((model: MembershipNewFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('memberKey', model.memberKey, SHORT_NAME_LENGTH);
  stringValidations('memberName1', model.memberName1, SHORT_NAME_LENGTH);
  stringValidations('memberName2', model.memberName2, SHORT_NAME_LENGTH);
  stringValidations('memberModelType', model.memberModelType, SHORT_NAME_LENGTH);
  stringValidations('memberType', model.memberType, SHORT_NAME_LENGTH);
  dateValidations('memberDateOfBirth', model.memberDateOfBirth);
  dateValidations('memberDateOfDeath', model.memberDateOfDeath);
  stringValidations('memberZipCode', model.memberZipCode, SHORT_NAME_LENGTH, 10, true); 
  stringValidations('memberBexioId', model.memberBexioId, SHORT_NAME_LENGTH, 20, true);
  // memberModelType
  stringValidations('orgKey', model.orgName, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH);
  dateValidations('dateOfEntry', model.dateOfEntry);
  stringValidations('membershipCategory', model.membershipCategory, SHORT_NAME_LENGTH, 4, true); 
});



