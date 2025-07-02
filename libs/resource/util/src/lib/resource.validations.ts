import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { CarType, GenderType, ResourceModel, ResourceType, RowingBoatType, RowingBoatUsage } from '@bk2/shared/models';
import { baseValidations, categoryValidations, isArrayOfBaseProperties, numberValidations, stringValidations } from '@bk2/shared/util-core';
import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import 'vest/enforce/compounds';


export const resourceValidations = staticSuite((model: ResourceModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('index', model.name, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  categoryValidations('type', model.type, ResourceType);
  numberValidations('currentValue', model.currentValue, true, 0, 100000);
  stringValidations('load', model.load, SHORT_NAME_LENGTH);
  numberValidations('weight', model.weight, true, 0, 10000);
  stringValidations('color', model.color, SHORT_NAME_LENGTH); // hexcolor
  stringValidations('brand', model.brand, SHORT_NAME_LENGTH); 
  stringValidations('model', model.model, SHORT_NAME_LENGTH); 
  stringValidations('serialNumber', model.serialNumber, SHORT_NAME_LENGTH); 
  numberValidations('seats', model.seats, true, 0, 100);
  numberValidations('length', model.length, false, 0, 500);
  numberValidations('width', model.width, false, 0, 50);
  numberValidations('height', model.height, false, 0, 50);

  omitWhen(model.data === undefined, () => {
    test('data', '@resourceData', () => {
      enforce(isArrayOfBaseProperties(model.data)).isTruthy();
    });
  });

  omitWhen(model.type !== ResourceType.RowingBoat, () => {
    test('boatType', '@boatSubType', () => {
      categoryValidations('subType', model.subType, RowingBoatType);
      categoryValidations('usage', model.usage, RowingBoatUsage);
    });
  });
  omitWhen(model.type !== ResourceType.Locker, () => {
    test('gender', '@genderSubType', () => {
      categoryValidations('subType', model.subType, GenderType);
    });
  });
  omitWhen(model.type !== ResourceType.Car, () => {
    test('carType', '@gcarSubType', () => {
      categoryValidations('subType', model.subType, CarType);
    });
  });
});
