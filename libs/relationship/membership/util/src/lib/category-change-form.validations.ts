
import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { dateValidations, stringValidations } from '@okr/shared-util-core';

import { CategoryChangeFormModel } from './category-change-form.model';

export const categoryChangeFormValidations = staticSuite((model: CategoryChangeFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('memberName', model.memberName, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH);
  dateValidations('dateOfChange', model.dateOfChange);
  stringValidations('membershipCategoryOld', model.membershipCategoryOld, SHORT_NAME_LENGTH, 4, true); 
  stringValidations('membershipCategoryNew', model.membershipCategoryNew, SHORT_NAME_LENGTH, 4, true); 
});



