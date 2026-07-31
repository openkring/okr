import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CITY_LENGTH, COUNTRY_LENGTH, DESCRIPTION_LENGTH, EMAIL_LENGTH, NUMBER_LENGTH, PHONE_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH, ZIP_LENGTH } from '@okr/shared-constants';
import { classifyStoreDate, dateValidations, getYear, isFutureDate, isStoreDateOrderValid, partialDateValidations, stringValidations } from '@okr/shared-util-core';

import { MemberNewFormModel } from './member-new-form.model';

export const memberNewFormValidations = staticSuite((model: MemberNewFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH, 4, true);
  stringValidations('gender', model.gender, WORD_LENGTH);
  // dob/dod may be partial: year only ('19850000') or a birthday without a year ('00000415')
  partialDateValidations('dateOfBirth', model.dateOfBirth);
  partialDateValidations('dateOfDeath', model.dateOfDeath);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);

  stringValidations('streetName', model.streetName, SHORT_NAME_LENGTH);
  stringValidations('streetNumber', model.streetNumber, NUMBER_LENGTH);
  stringValidations('zipCode', model.zipCode, ZIP_LENGTH);
  stringValidations('city', model.city, CITY_LENGTH);
  stringValidations('countryCode', model.countryCode, COUNTRY_LENGTH);
  stringValidations('phone', model.phone, PHONE_LENGTH);
  stringValidations('email', model.email, EMAIL_LENGTH);
  stringValidations('web', model.web, SHORT_NAME_LENGTH);

  stringValidations('orgKey', model.orgKey, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH);
  stringValidations('category', model.category, SHORT_NAME_LENGTH);
  dateValidations('dateOfEntry', model.dateOfEntry);

  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  //tagValidations('tags', model.tags);

  // cross field validations
  // isFutureDate parses a full StoreDate and would throw/misbehave on a partial one (a
  // year-only value parses to an Invalid Date, not null — see date.util's classifyStoreDate
  // doc). A year-only dob/dod is checked at year granularity instead; a birthday without a
  // year has no year to compare and is skipped.
  const dobPrecision = classifyStoreDate(model.dateOfBirth);
  omitWhen(model.dateOfBirth === '' || dobPrecision === 'dayMonthOnly', () => {
    test('dateOfBirth', '@personDateOfBirthNotFuture', () => {
      if (dobPrecision === 'yearOnly') {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        enforce(Number(model.dateOfBirth!.substring(0, 4))).lessThanOrEquals(getYear());
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        enforce(isFutureDate(model.dateOfBirth!)).isFalsy();
      }
    })
  });

  const dodPrecision = classifyStoreDate(model.dateOfDeath);
  omitWhen(model.dateOfDeath === '' || dodPrecision === 'dayMonthOnly', () => {
    test('dateOfDeath', '@personDateOfDeathNotFuture', () => {
      if (dodPrecision === 'yearOnly') {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        enforce(Number(model.dateOfDeath!.substring(0, 4))).lessThanOrEquals(getYear());
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        enforce(isFutureDate(model.dateOfDeath!)).isFalsy();
      }
    })
  });

  omitWhen(model.dateOfDeath === '' || model.dateOfBirth === '', () => {
    test('dateOfDeath', '@personDateOfDeathAfterBirth', () => {
      // compares at the coarsest precision the two dates share; a pair with no
      // comparable year (a birthday without a year) reports no conflict
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isStoreDateOrderValid(model.dateOfBirth!, model.dateOfDeath!)).isTruthy();
    });
  })
  // cross collection validations
});

