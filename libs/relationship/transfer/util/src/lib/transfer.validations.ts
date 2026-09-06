import { only, staticSuite } from 'vest';

import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { TransferModel } from '@okr/shared-models';
import { booleanValidations, dateValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const transferValidations = staticSuite((model: TransferModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  stringValidations('okey', model.okey, SHORT_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived);
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);

  // transfer
  dateValidations('dateOfTransfer', model.dateOfTransfer);
  stringValidations('type', model.type, WORD_LENGTH);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  // tbd: check that label is set, when type === custom

  // price
  numberValidations('price', model.price, false, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
});






