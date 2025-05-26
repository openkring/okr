import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { baseValidations } from '@bk2/shared/data-access';
import { CategoryItemModel, CategoryListModel } from '@bk2/shared/models';
import { booleanValidations, numberValidations, stringValidations } from '@bk2/shared/util';
import { only, staticSuite} from 'vest';

export const categoryListValidations = staticSuite((model: CategoryListModel, field?: string) => {
  if (field) only(field);

  baseValidations(model);
  stringValidations('i18nBase', model.name, SHORT_NAME_LENGTH);
  stringValidations('notes', model.name, DESCRIPTION_LENGTH);
  booleanValidations('translateItems', model.translateItems);
});

export const categoryItemValidations = staticSuite((model: CategoryItemModel, field?: string) => {
  if (field) only(field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('abbreviation', model.name, SHORT_NAME_LENGTH);
  stringValidations('icon', model.name, SHORT_NAME_LENGTH);
  stringValidations('state', model.name, SHORT_NAME_LENGTH);
  numberValidations('price', model.name, false, 0, 9999999);
  stringValidations('currency', model.name, SHORT_NAME_LENGTH);
  stringValidations('periodicity', model.name, SHORT_NAME_LENGTH);
});

