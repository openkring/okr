import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { ResourceFormModel } from './resource-form.model';
import { categoryValidations, isArrayOfBaseProperties, numberValidations, stringValidations } from '@bk2/shared/util';
import { CarType, GenderType, ResourceType, RowingBoatType, RowingBoatUsage } from '@bk2/shared/models';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';

export const resourceFormValidations = staticSuite((model: ResourceFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 1, true);
  numberValidations('keyNr', model.keyNr, true, 0, 100000);
  numberValidations('lockerNr', model.lockerNr, true, 0, 120);  
  categoryValidations('type', model.type, ResourceType);
  categoryValidations('gender', model.gender, GenderType);
  categoryValidations('rowingBoatType', model.rowingBoatType, RowingBoatType);
  categoryValidations('carType', model.carType, CarType);
  categoryValidations('usage', model.usage, RowingBoatUsage);
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
