import { only, staticSuite } from 'vest';

import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { dateValidations, numberValidations, stringValidations } from '@bk2/shared-util-core';

import { TransferFormModel } from './transfer-form.model';

export const transferFormValidations = staticSuite((model: TransferFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
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






