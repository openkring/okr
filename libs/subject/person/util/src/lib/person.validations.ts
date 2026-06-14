import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { PersonModel, PrivacyUsage } from '@bk2/shared-models';
import { baseValidations, categoryValidations, dateValidations, isAfterDate, stringValidations } from '@bk2/shared-util-core';

export const personValidations = staticSuite((model: PersonModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('index', model.index, SHORT_NAME_LENGTH);
  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH);
  stringValidations('gender', model.gender, WORD_LENGTH);
  stringValidations('ssnId', model.ssnId);
  dateValidations('dateOfBirth', model.dateOfBirth);
  dateValidations('dateOfDeath', model.dateOfDeath);
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
  omitWhen(model.dateOfDeath === '' || model.dateOfBirth === '', () => {
    test('dateOfDeath', '@personDeathAfterBirth', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfDeath, model.dateOfBirth)).isTruthy();
    });
  });

  // cross collection validations
  // tbd: cross reference bkey in subjects
  // tbd: match zipcode and city from swisscities dictionary

});
