import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { PersonFormModel } from './person-form.model';
import { categoryValidations, dateValidations, isAfterDate, isFutureDate, stringValidations } from '@bk2/shared/util-core';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/constants';
import { GenderType } from '@bk2/shared/models';
import { ssnValidations } from './ssn.validations';

export const personFormValidations = staticSuite((model: PersonFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('firstName', model.firstName, SHORT_NAME_LENGTH);
  stringValidations('lastName', model.lastName, SHORT_NAME_LENGTH);
  categoryValidations('gender', model.gender, GenderType);
  dateValidations('dateOfBirth', model.dateOfBirth);
  dateValidations('dateOfDeath', model.dateOfDeath);
  ssnValidations('ssn', model.ssnId);
  stringValidations('bexioId', model.bexioId, SHORT_NAME_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  //tagValidations('tags', model.tags);

  // cross field validations
  omitWhen(model.dateOfBirth === '', () => {
    test('dateOfBirth', '@personDateOfBirthNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.dateOfBirth!)).isFalsy();
    })
  });

  omitWhen(model.dateOfDeath === '', () => {
    test('dateOfDeath', '@personDateOfDeathNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.dateOfDeath!)).isFalsy();
    })
  });

  omitWhen(model.dateOfDeath === '' || model.dateOfBirth === '', () => {
    test('dateOfDeath', '@personDateOfDeathAfterBirth', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfDeath!, model.dateOfBirth!)).isTruthy();
    });
  })
  // cross collection validations
});

