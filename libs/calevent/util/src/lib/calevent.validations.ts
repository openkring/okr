import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { CalEventModel } from '@bk2/shared-models';
import { baseValidations, dateValidations, isAfterDate, isAfterOrEqualDate, stringValidations } from '@bk2/shared-util-core';

export const calEventValidations = staticSuite((model: CalEventModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  stringValidations('type', model.type, WORD_LENGTH);
  dateValidations('startDate', model.startDate);
  dateValidations('endDate', model.endDate);
  stringValidations('locationKey', model.locationKey, SHORT_NAME_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
  dateValidations('repeatUntilDate', model.repeatUntilDate);
  // tbd: responsiblePersons: AvatarInfo[] - not yet implemented

  test('startDate', '@calEventStartDateMandatory', () => {
    enforce(model.startDate).isNotEmpty();
  });
  test('endDate', '@calEventEndDateMandatory', () => {
    enforce(model.endDate).isNotEmpty();
  });

  // field cross validations
  test('endDate', '@calEventEndDateAfterStartDate', () => {
    enforce(isAfterOrEqualDate(model.endDate, model.startDate)).isTruthy();
  });

  omitWhen(model.periodicity === 'once', () => {
    test('repeatUntilDate', '@calEventRepeatUntilDateMandatoryWithGivenPeriodicity', () => {
      enforce(model.repeatUntilDate).isNotEmpty();
    });
    test('repeatUntilDate', '@calEventRepeatUntilDateAfterStartDate', () => {
      enforce(isAfterDate(model.repeatUntilDate, model.startDate)).isTruthy();
    });
  })

});

// tbd: cross the locationKey to reference into locations

