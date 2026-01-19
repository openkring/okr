
import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { ABBREVIATION_LENGTH, BEXIO_ID_LENGTH, CURRENCY_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH, ZIP_LENGTH } from '@bk2/shared-constants';
import { MembershipModel } from '@bk2/shared-models';
import { baseValidations, booleanValidations, dateValidations, isAfterDate, isFutureDate, numberValidations, stringValidations } from '@bk2/shared-util-core';

export const membershipValidations = staticSuite((model: MembershipModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  // subject
  stringValidations('memberKey', model.memberKey, SHORT_NAME_LENGTH);
  stringValidations('memberName1', model.memberName1, SHORT_NAME_LENGTH);
  stringValidations('memberName2', model.memberName2, SHORT_NAME_LENGTH);
  stringValidations('memberModelType', model.memberModelType, WORD_LENGTH); // tbd: if Person: gender, else orgType

  omitWhen(model.memberModelType !== 'person', () => {
    stringValidations('memberType', model.memberType, WORD_LENGTH);
  });
  omitWhen(model.memberModelType !== 'org', () => {
    stringValidations('memberType', model.memberType, WORD_LENGTH);
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

  numberValidations('priority', model.order, true, 0, 10);
  stringValidations('relLog', model.relLog, SHORT_NAME_LENGTH);
  booleanValidations('relIsLast', model.relIsLast);

  numberValidations('price', model.price, false, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);

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
