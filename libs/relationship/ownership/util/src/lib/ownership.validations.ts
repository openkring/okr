import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { ABBREVIATION_LENGTH, CURRENCY_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { OwnershipModel } from '@bk2/shared-models';
import { baseValidations, dateValidations, isAfterDate, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const ownershipValidations = staticSuite((model: OwnershipModel, field?: string) => {
  if (field) only(field);

  // base
  baseValidations(model);

  // owner
  stringValidations('ownerKey', model.ownerKey, SHORT_NAME_LENGTH);
  stringValidations('ownerName1', model.ownerName1, SHORT_NAME_LENGTH);
  stringValidations('ownerName2', model.ownerName2, SHORT_NAME_LENGTH);
  // tbd: test ownerModelType to be either Person or Org
  omitWhen(model.ownerModelType !== 'person', () => {
    stringValidations('ownerType', model.ownerType, WORD_LENGTH);   // gender
  });
  omitWhen(model.ownerModelType !== 'org', () => {
    stringValidations('ownerType', model.ownerType, WORD_LENGTH);   // org type
  });

  // resource
  stringValidations('resourceKey', model.resourceKey, SHORT_NAME_LENGTH);
  stringValidations('resourceName', model.resourceName, SHORT_NAME_LENGTH);

  // tbd: test resourceModelType to be either Resource or Account
  omitWhen(model.resourceModelType !== 'account', () => {
    stringValidations('resourceType', model.resourceType, WORD_LENGTH);     // accountType
  });
  omitWhen(model.resourceModelType !== 'resource', () => {
    stringValidations('resourceType', model.resourceType, WORD_LENGTH);   // resourceType
  });
  omitWhen(model.resourceType !== 'rboat', () => {
    stringValidations('resourceSubType', model.resourceSubType, WORD_LENGTH);   
  });

  // ownership
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

   omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@ownershipValidToAfterValidFrom', () => {
      enforce(isAfterDate(model.validTo, model.validFrom)).isTruthy();
    });
  });
  stringValidations('ownershipCategory', model.ownershipCategory, SHORT_NAME_LENGTH, 3, true);
  stringValidations('ownershipState', model.ownershipState, SHORT_NAME_LENGTH, 3, true);

  stringValidations('count', model.count, ABBREVIATION_LENGTH);
  numberValidations('order', model.order, true, 0, 100);

  numberValidations('price', model.price);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
});

