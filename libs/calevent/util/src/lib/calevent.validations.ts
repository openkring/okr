import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { MAX_DATES_PER_SERIES, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { CalEventModel } from '@okr/shared-models';
import { baseValidations, calculateRecurringDates, dateValidations, isAfterDate, numberValidations, stringValidations } from '@okr/shared-util-core';

export const calEventValidations = staticSuite((model: CalEventModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('type', model.type, WORD_LENGTH);
  dateValidations('startDate', model.startDate);
  numberValidations('durationMinutes', model.durationMinutes, true, 0, 1440);
  stringValidations('locationKey', model.locationKey, SHORT_NAME_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
  dateValidations('repeatUntilDate', model.repeatUntilDate);
  // tbd: responsiblePersons: AvatarInfo[] - not yet implemented

  // no '@' prefix: ErrorNote resolves a bare key as 'validation.<key>' in the main bundle, which is
  // where these messages live. With the '@' it would be looked up at the bundle root and never resolve.
  test('startDate', 'caleventStartDateMandatory', () => {
    enforce(model.startDate).isNotEmpty();
  });

  omitWhen(model.periodicity === 'once', () => {
    test('repeatUntilDate', 'caleventRepeatUntilDateMandatoryWithGivenPeriodicity', () => {
      enforce(model.repeatUntilDate).isNotEmpty();
    });
    test('repeatUntilDate', 'caleventRepeatUntilDateAfterStartDate', () => {
      enforce(isAfterDate(model.repeatUntilDate, model.startDate)).isTruthy();
    });
    // block an oversized series in the form: the store can only refuse it with an error toast
    test('repeatUntilDate', 'caleventMaxDatesPerSeries', () => {
      enforce(calculateRecurringDates(model.startDate, model.repeatUntilDate, model.periodicity).length).lte(MAX_DATES_PER_SERIES);
    });
  })

  // seriesId is assigned by the store at save time (createEventSeries / convertEventToSeries),
  // never by the user -- the form shows it read-only. Requiring it here made every NEW recurring
  // event invalid on an invisible, unfixable field: no change-confirmation bar, no way to save.
  stringValidations('seriesId', model.seriesId ?? '', WORD_LENGTH);
});

// tbd: cross the locationKey to reference into locations

