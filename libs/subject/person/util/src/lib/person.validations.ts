import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { PrivacyUsage } from '@okr/shared-models';
import { baseValidations, categoryValidations, isStoreDateOrderValid, partialDateValidations, stringValidations } from '@okr/shared-util-core';

import { PersonFormModel } from './person-form.model';
import { ssnValidations } from './ssn.validations';

// Validates the person edit/profile form data: PersonFormModel keeps the vault-backed
// ssn/dob fields that were stripped from PersonModel (spec 1.19 Phase 4).
export const personValidations = staticSuite((model: PersonFormModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('index', model.index, SHORT_NAME_LENGTH);
  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH);
  stringValidations('gender', model.gender, WORD_LENGTH);
  ssnValidations('ssnId', model.ssnId ?? '');
  // dob/dod may be partial: year only ('19850000') or a birthday without a year ('00000415')
  partialDateValidations('dateOfBirth', model.dateOfBirth ?? '');
  partialDateValidations('dateOfDeath', model.dateOfDeath ?? '');
  stringValidations('bexioId', model.bexioId, 6);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  //tagValidations('tags', model.tags);

  // privacy preferences (usage*)
  categoryValidations('usageImages', model.usageImages, PrivacyUsage);
  categoryValidations('usageDateOfBirth', model.usageDateOfBirth, PrivacyUsage);
  categoryValidations('usagePostalAddress', model.usagePostalAddress, PrivacyUsage);
  categoryValidations('usagePhone', model.usagePhone, PrivacyUsage);
  categoryValidations('usageEmail', model.usageEmail, PrivacyUsage);
  categoryValidations('usageName', model.usageName, PrivacyUsage);

  // cross field validations
  omitWhen(!model.dateOfDeath || !model.dateOfBirth, () => {
    test('dateOfDeath', '@personDeathAfterBirth', () => {
      // compares at the coarsest precision the two dates share; a pair with no
      // comparable year (a birthday without a year) reports no conflict
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isStoreDateOrderValid(model.dateOfBirth!, model.dateOfDeath!)).isTruthy();
    });
  });

  // cross collection validations
  // tbd: cross reference okey in subjects
  // tbd: match zipcode and city from swisscities dictionary

});
