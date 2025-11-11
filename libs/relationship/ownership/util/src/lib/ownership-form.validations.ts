import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { ABBREVIATION_LENGTH, CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { dateValidations, isAfterDate, numberValidations, stringValidations } from '@bk2/shared-util-core';

import { OwnershipFormModel } from './ownership-form.model';

export const ownershipFormValidations = staticSuite((model: OwnershipFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  stringValidations('ownerKey', model.ownerKey, SHORT_NAME_LENGTH);
  stringValidations('ownerName1', model.ownerName1, SHORT_NAME_LENGTH);
  stringValidations('ownerName2', model.ownerName2, SHORT_NAME_LENGTH);

  // tbd: test ownerModelType to be either Person or Org
  stringValidations('ownerType', model.ownerType, WORD_LENGTH); 
  // tbd: test the values of ownerType
    
  stringValidations('resourceKey', model.resourceKey, SHORT_NAME_LENGTH);
  stringValidations('resourceName', model.resourceName, SHORT_NAME_LENGTH);
  // tbd: test resourceModelType to be either Resource or Account

  stringValidations('resourceType', model.resourceType, WORD_LENGTH);
    // tbd: test resourceType to be either Resource or Account
 
  stringValidations('resourceSubType', model.resourceSubType, WORD_LENGTH);
  // tbd: test resourceSubType to be either a ResourceType or AccountType based on resourceType

  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

   // cross field validations
   omitWhen(model.validFrom === '' || model.validTo === '', () => {
    test('validTo', '@ownershipValidToAfterValidFrom', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.validTo!, model.validFrom!)).isTruthy();
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
