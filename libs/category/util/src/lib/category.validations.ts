import { ABBREVIATION_LENGTH, DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { baseValidations, booleanValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { omitWhen, staticSuite } from 'vest';

export const categoryListValidations = staticSuite((model: CategoryListModel, tenants: string, tags: string) => {
  baseValidations(model, tenants, tags);
  stringValidations('i18n', model.i18n, NAME_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  booleanValidations('translateItems', model.translateItems);
});

export const categoryItemValidations = staticSuite((model: CategoryItemModel) => {
  // Every rule below `name` used to pass `model.name` — a copy/paste sweep. `price` was the worst:
  // numberValidations on a string failed for every item, so the category item form could never be
  // saved and the change-confirmation banner never appeared.
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('icon', model.icon);
  // Every field below is optional on CategoryItemModel, so each is skipped when unset —
  // stringValidations/numberValidations both fail an undefined value outright.
  omitWhen(model.abbreviation === undefined, () => stringValidations('abbreviation', model.abbreviation, ABBREVIATION_LENGTH));
  omitWhen(model.state === undefined, () => stringValidations('state', model.state));
  omitWhen(model.price === undefined, () => numberValidations('price', model.price, false, 0, 9999999));
  omitWhen(model.currency === undefined, () => stringValidations('currency', model.currency));
  omitWhen(model.periodicity === undefined, () => stringValidations('periodicity', model.periodicity));
});

