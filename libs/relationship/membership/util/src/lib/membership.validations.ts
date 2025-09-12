
import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { ABBREVIATION_LENGTH, BEXIO_ID_LENGTH, CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, ZIP_LENGTH } from '@bk2/shared-constants';
import { GenderType, MembershipModel, ModelType, OrgType, Periodicity } from '@bk2/shared-models';
import { booleanValidations, categoryValidations, dateValidations, isAfterDate, isFutureDate, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const membershipValidations = staticSuite((model: MembershipModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  booleanValidations('isArchived', model.isArchived);
  stringValidations('index', model.index, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // subject
  stringValidations('memberKey', model.memberKey, SHORT_NAME_LENGTH);
  stringValidations('memberName1', model.memberName1, SHORT_NAME_LENGTH);
  stringValidations('memberName2', model.memberName2, SHORT_NAME_LENGTH);
  categoryValidations('memberModelType', model.memberModelType, ModelType); // tbd: if Person: gender, else orgType

  omitWhen(model.memberModelType !== ModelType.Person, () => {
    categoryValidations('memberType', model.memberType, GenderType);
  });
  omitWhen(model.memberModelType !== ModelType.Org, () => {
    categoryValidations('memberType', model.memberType, OrgType);
  });
  stringValidations('memberNickName', model.memberNickName, SHORT_NAME_LENGTH);
  stringValidations('memberAbbreviation', model.memberAbbreviation, ABBREVIATION_LENGTH);
  dateValidations('memberDateOfBirth', model.memberDateOfBirth);
  dateValidations('memberDateOfDeath', model.memberDateOfDeath);
  stringValidations('memberZipCode', model.memberZipCode, ZIP_LENGTH);
  stringValidations('memberBexioId', model.memberBexioId, BEXIO_ID_LENGTH);

  // membership organization
  stringValidations('orgKey', model.orgKey, SHORT_NAME_LENGTH);
  stringValidations('orgName', model.orgName, SHORT_NAME_LENGTH);

  // relationship
  stringValidations('memberId', model.memberId, SHORT_NAME_LENGTH);
  dateValidations('dateOfEntry', model.dateOfEntry);
  dateValidations('dateOfExit', model.dateOfExit);
  stringValidations('membershipCategory', model.membershipCategory, SHORT_NAME_LENGTH, 4, true); 
  stringValidations('membershipState', model.membershipState, SHORT_NAME_LENGTH, 4, true); 
  stringValidations('orgFunction', model.orgFunction, SHORT_NAME_LENGTH);

  numberValidations('priority', model.priority, true, 0, 10);
  stringValidations('relLog', model.relLog, SHORT_NAME_LENGTH);
  booleanValidations('relIsLast', model.relIsLast);

  numberValidations('price', model.price, false, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);

   // cross field validations
  omitWhen(model.dateOfEntry === '' || model.dateOfExit === '', () => {
    test('dateOfExit', '@membershipExitAfterEntry', () => {
      enforce(isAfterDate(model.dateOfExit, model.dateOfEntry)).isTruthy();
    });
  });

  omitWhen(model.memberDateOfBirth === '', () => {
    test('dateOfBirth', '@membershipDateOfBirthNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.memberDateOfBirth)).isFalsy();
    })
  });

  // tbd: cross reference memberKey in subjects
  // tbd: cross reference orgId in subjects
});



