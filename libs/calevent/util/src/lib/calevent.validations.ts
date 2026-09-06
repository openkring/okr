import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { LONG_NAME_LENGTH, MAX_DATES_PER_SERIES, NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { CalEventModel } from '@okr/shared-models';
import { baseValidations, calculateRecurringDates, dateValidations, isAfterOrEqualDate, numberValidations, stringValidations } from '@okr/shared-util-core';

export const calEventValidations = staticSuite((model: CalEventModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  // The name is what a member recognises the appointment by, and what the duplicate check compares
  // events on. It was optional until now: baseValidations calls stringValidations WITHOUT the
  // isMandatory flag, and that same flag also gates the length cap — so `name` was checked for
  // null/undefined/string and nothing else. A half-filled form therefore saved a nameless event,
  // which is how the first of the three '4X-Dienstag' series was created on 2026-06-10
  // ('20260620 07:30: ' in the audit log). A nameless event also collides with nothing, so no
  // duplicate warning could ever fire for it.
  // Repeating the call with isMandatory=true is the idiom used by meeting/room/topic and ~15 other
  // suites; it adds 'required' (isNotBlank, so a name of blanks is rejected too) and 'tooLong'.
  stringValidations('name', model.name, NAME_LENGTH, 1, true);
  stringValidations('type', model.type, WORD_LENGTH);
  dateValidations('startDate', model.startDate);
  numberValidations('durationMinutes', model.durationMinutes, true, 0, 1440);
  // 0 = unrestricted; the upper bound only keeps a typo (a pasted phone number) out of the field
  numberValidations('maxAttendees', model.maxAttendees ?? 0, true, 0, 100000);
  // LONG_NAME_LENGTH: locationKey holds a 'name@okey' tuple (a 20-char autoid plus the place
  // name) or free text. 63 live scs events already exceed the old 30-cap
  // ('Bootshaus - Kafipause in OST Rapperswil'), and a tuple can pass 50 as well.
  stringValidations('locationKey', model.locationKey, LONG_NAME_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);
  dateValidations('repeatUntilDate', model.repeatUntilDate);
  // tbd: responsiblePersons: AvatarInfo[] - not yet implemented

  // no '@' prefix: ErrorNote resolves a bare key as 'validation.<key>' in the main bundle, which is
  // where these messages live. With the '@' it would be looked up at the bundle root and never resolve.
  test('startDate', 'caleventStartDateMandatory', () => {
    enforce(model.startDate).isNotEmpty();
  });

  // A poll-born series (state 'definitive', seriesId set, pollMultiSelect true) holds the irregular
  // dates the organizer confirmed. No periodicity describes them, so turning it into a rule-based
  // series would let planSeriesReconcile archive every sibling date as surplus. The form renders the
  // periodicity read-only; this is the layer that makes the change unsavable if it slips through.
  test('periodicity', 'caleventPollSeriesPeriodicityLocked', () => {
    enforce(!(model.pollMultiSelect && model.periodicity !== 'once')).isTruthy();
  });

  omitWhen(model.periodicity === 'once', () => {
    test('repeatUntilDate', 'caleventRepeatUntilDateMandatoryWithGivenPeriodicity', () => {
      enforce(model.repeatUntilDate).isNotEmpty();
    });
    // same-day is allowed on purpose: every occurrence of a materialised series carries the
    // series' repeatUntilDate, so on the LAST occurrence startDate === repeatUntilDate. Demanding
    // 'strictly after' made those events permanently unsavable — the field is rendered without an
    // error note, so the change-confirmation bar just never appeared (10 live scs events).
    test('repeatUntilDate', 'caleventRepeatUntilDateNotBeforeStartDate', () => {
      enforce(isAfterOrEqualDate(model.repeatUntilDate, model.startDate)).isTruthy();
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

