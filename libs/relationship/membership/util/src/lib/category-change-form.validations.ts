
import { SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { dateValidations, stringValidations } from '@bk2/shared/util-core';
import { only, staticSuite} from 'vest';
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



