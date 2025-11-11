import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { isArrayOfBaseProperties, numberValidations, stringValidations } from '@bk2/shared-util-core';

import { ResourceFormModel } from './resource-form.model';

export const resourceFormValidations = staticSuite((model: ResourceFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 1, true);
  numberValidations('keyNr', model.keyNr, true, 0, 100000);
  numberValidations('lockerNr', model.lockerNr, true, 0, 120);  
  stringValidations('type', model.type, WORD_LENGTH);
  stringValidations('subType', model.subType, WORD_LENGTH);
  stringValidations('usage', model.usage, WORD_LENGTH);
  numberValidations('currentValue', model.currentValue, true, 0, 100000);
  numberValidations('weight', model.weight, true, 0, 10000);
  stringValidations('load', model.load, SHORT_NAME_LENGTH);
  stringValidations('brand', model.brand, SHORT_NAME_LENGTH); 
  stringValidations('model', model.model, SHORT_NAME_LENGTH); 
  stringValidations('serialNumber', model.serialNumber, SHORT_NAME_LENGTH); 
  numberValidations('seats', model.seats, true, 0, 100);
  numberValidations('length', model.length, false, 0, 500);
  numberValidations('width', model.width, false, 0, 50);
  numberValidations('height', model.height, false, 0, 50);
  stringValidations('hexColor', model.hexColor, SHORT_NAME_LENGTH);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  //tagValidations('tags', model.tags);

  omitWhen(model.data === undefined, () => {
    test('data', '@resourceData', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });
});
