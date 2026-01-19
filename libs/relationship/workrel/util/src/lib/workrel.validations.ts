
import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { WorkrelModel } from '@bk2/shared-models';
import { dateValidations, isAfterOrEqualDate, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const workrelValidations = staticSuite((model: WorkrelModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
 // tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // subject
  stringValidations('subjectKey', model.subjectKey, SHORT_NAME_LENGTH);
  stringValidations('subjectName1', model.subjectName1, SHORT_NAME_LENGTH);
  stringValidations('subjectName2', model.subjectName2, SHORT_NAME_LENGTH);
  stringValidations('subjectType', model.subjectType, WORD_LENGTH);

  // object
  stringValidations('objectKey', model.objectKey, SHORT_NAME_LENGTH);
  stringValidations('objectName', model.objectName, SHORT_NAME_LENGTH);
  stringValidations('objectType', model.objectType, WORD_LENGTH);

  stringValidations('type', model.type, WORD_LENGTH);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

    // cross field validations
  omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@workrelValidToAfterValidFrom', () => {
      enforce(isAfterOrEqualDate(model.validTo, model.validFrom)).isTruthy();
    });
  });

  numberValidations('price', model.price, true, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
  numberValidations('order', model.order, true, 0, 100);
  stringValidations('state', model.state, WORD_LENGTH);
});



