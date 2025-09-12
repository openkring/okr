import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { booleanValidations, numberValidations, stringValidations } from '@bk2/shared-util-core';

import { CategoryItemFormModel, CategoryListFormModel } from './category-form.model';


export const categoryListFormValidations = staticSuite((model: CategoryListFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
 // tagValidations('tags', model.tags);
  booleanValidations('isArchived', model.isArchived, false);
 // tenantValidations(model.tenants);
  stringValidations('index', model.index, SHORT_NAME_LENGTH);

  stringValidations('i18nBase', model.name, SHORT_NAME_LENGTH);
  booleanValidations('translateItems', model.translateItems);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

});

export const categoryItemFormValidations = staticSuite((model: CategoryItemFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('abbreviation', model.abbreviation, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon, SHORT_NAME_LENGTH);
  stringValidations('state', model.state, SHORT_NAME_LENGTH);
  stringValidations('currency', model.currency, SHORT_NAME_LENGTH);
  stringValidations('periodicity', model.periodicity, SHORT_NAME_LENGTH);
  numberValidations('price', model.price, false, 0, 9999999);
});

