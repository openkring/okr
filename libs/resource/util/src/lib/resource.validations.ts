import { enforce, omitWhen, only, staticSuite, test } from 'vest';
import 'vest/enforce/compounds';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { ResourceModel } from '@okr/shared-models';
import { baseValidations, isArrayOfBaseProperties, numberValidations, stringValidations } from '@okr/shared-util-core';

export const resourceValidations = staticSuite((model: ResourceModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  // Mirrors baseValidations, like every sibling suite does. Uncapped: `index` is generated
  // (getResourceIndex) and the service overwrites it at save time, after this suite has run.
  // This line used to pass model.NAME while filing under 'index' — a copy/paste slip that made
  // the wrong value carry the wrong field's cap. Harmless while caps were inert; with them
  // enforced it would have judged resource indexes (up to 32 characters live) by the 30-char
  // name cap, on a field nobody can edit.
  stringValidations('index', model.index);
  //tagValidations('tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('type', model.type);
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

  // These used to sit inside an outer `test('boatType', ...)` wrapper. Nesting test() inside a
  // test callback files the failures under the INNER field name anyway, so the wrapper only hid
  // which field was at fault — and the wrapper itself always passed, because its callback
  // enforces nothing.
  omitWhen(model.type !== 'rboat', () => {
    stringValidations('subType', model.subType, undefined, 0, true);
    // Uncapped on purpose: `usage` is not a word the user types, it is the generated multi-season
    // allocation string ('bs,2026:ls1,2027:ls1,...', see setUsageFromYear, which writes one entry
    // per season of the PLANNING_WINDOW and keeps the historical ones). It blew past WORD_LENGTH
    // the moment a boat had more than one season, which silently invalidated the WHOLE form and
    // made the change-confirmation banner disappear for every edit on that boat.
    stringValidations('usage', model.usage);
  });
  omitWhen(model.type !== 'locker', () => {
    stringValidations('subType', model.subType, undefined, 0, true); // gender
  });
  omitWhen(model.type !== 'car', () => {
    stringValidations('subType', model.subType, undefined, 0, true);
  });
});
