import { enforce, omitWhen, only, staticSuite, test } from 'vest';
import 'vest/enforce/compounds';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { ResourceModel } from '@bk2/shared-models';
import { baseValidations, isArrayOfBaseProperties, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const resourceValidations = staticSuite((model: ResourceModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('index', model.name, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('type', model.type, WORD_LENGTH);
  numberValidations('currentValue', model.currentValue, true, 0, 100000);
  stringValidations('load', model.load, SHORT_NAME_LENGTH);
  numberValidations('weight', model.weight, true, 0, 10000);
  stringValidations('color', model.color, SHORT_NAME_LENGTH); // hexcolor
  stringValidations('brand', model.brand, SHORT_NAME_LENGTH); 
  stringValidations('model', model.model, SHORT_NAME_LENGTH); 
  stringValidations('id', model.id, SHORT_NAME_LENGTH); 
  numberValidations('seats', model.seats, true, 0, 100);
  numberValidations('length', model.length, false, 0, 500);
  numberValidations('width', model.width, false, 0, 50);
  numberValidations('height', model.height, false, 0, 50);

  omitWhen(model.data === undefined, () => {
    test('data', '@resourceData', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });

  omitWhen(model.type !== 'rboat', () => {
    test('boatType', '@boatSubType', () => {
      stringValidations('subType', model.subType, WORD_LENGTH, 3, true);
      stringValidations('usage', model.usage, WORD_LENGTH);
    });
  });
  omitWhen(model.type !== 'locker', () => {
    test('gender', '@genderSubType', () => {
      stringValidations('subType', model.subType, WORD_LENGTH, 4, true); // gender 
    });
  });
  omitWhen(model.type !== 'car', () => {
    test('carType', '@gcarSubType', () => {
      stringValidations('subType', model.subType, WORD_LENGTH, 3, true);
    });
  });
});
