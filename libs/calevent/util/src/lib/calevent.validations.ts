import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { CalEventModel } from '@bk2/shared-models';
import { baseValidations, dateValidations, isAfterDate, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const calEventValidations = staticSuite((model: CalEventModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  stringValidations('type', model.type, WORD_LENGTH);
  dateValidations('startDate', model.startDate);
  numberValidations('durationMinutes', model.durationMinutes, true, 0, 1440);
  stringValidations('locationKey', model.locationKey, SHORT_NAME_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
  dateValidations('repeatUntilDate', model.repeatUntilDate);
  // tbd: responsiblePersons: AvatarInfo[] - not yet implemented

  test('startDate', '@caleventStartDateMandatory', () => {
    enforce(model.startDate).isNotEmpty();
  });

  omitWhen(model.periodicity === 'once', () => {
    test('repeatUntilDate', '@caleventRepeatUntilDateMandatoryWithGivenPeriodicity', () => {
      enforce(model.repeatUntilDate).isNotEmpty();
    });
    test('repeatUntilDate', '@caleventRepeatUntilDateAfterStartDate', () => {
      enforce(isAfterDate(model.repeatUntilDate, model.startDate)).isTruthy();
    });
    stringValidations('seriesId', model.seriesId, WORD_LENGTH, 6, true);
  })
});

// tbd: cross the locationKey to reference into locations

