
import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { LocationModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

export const locationValidations = staticSuite((model: LocationModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);  // okey, tenants, isArchived
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  // NAME_LENGTH, not SHORT_NAME_LENGTH: live scs locations already carry 31-character names
  // ('Rapperswil - Busskirch - Hurden'), which the 30-cap would have made unsavable.
  stringValidations('name', model.name, NAME_LENGTH);
  stringValidations('address', model.address, LONG_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('type', model.type, WORD_LENGTH);
  numberValidations('latitude', model.latitude, false, -90, 90);
  numberValidations('longitude', model.longitude, false, -180, 180);
  stringValidations('placeId', model.placeId, SHORT_NAME_LENGTH);
  stringValidations('what3words', model.what3words, SHORT_NAME_LENGTH);
  numberValidations('seaLevel', model.seaLevel, false, 0, 9000);
  numberValidations('speed', model.speed, false, 0, 300);
  numberValidations('direction', model.direction, false, -180, 180);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
});

// tbd: cross reference what3words and placeId, as well as latitude and longitude
// tbd: visibleTo: string[]


