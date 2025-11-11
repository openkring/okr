import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { dateValidations, isAfterOrEqualDate, numberValidations, stringValidations, timeValidations } from '@bk2/shared-util-core';

import { ReservationFormModel } from './reservation-form.model';


export const reservationFormValidations = staticSuite((model: ReservationFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);

  // reserver
  stringValidations('reserverKey', model.reserverKey, SHORT_NAME_LENGTH);
  stringValidations('reserverName', model.reserverName, SHORT_NAME_LENGTH);
  stringValidations('reserverName2', model.reserverName2, SHORT_NAME_LENGTH);
  stringValidations('reserverModelType', model.reserverModelType, WORD_LENGTH); // tbd: if Person: gender, else orgType
  omitWhen(model.reserverModelType !== 'person', () => {
    stringValidations('reserverType', model.reserverType, WORD_LENGTH);   // gender
  });
  omitWhen(model.reserverModelType !== 'org', () => {
    stringValidations('reserverType', model.reserverType, WORD_LENGTH);   // org type
  });

  // resource
  stringValidations('resourceKey', model.resourceKey, SHORT_NAME_LENGTH);
  stringValidations('resourceName', model.resourceName, SHORT_NAME_LENGTH);
  stringValidations('resourceModelType', model.resourceModelType, WORD_LENGTH); // Resource or Account
  omitWhen(model.resourceModelType !== 'resource', () => {
    stringValidations('resourceType', model.resourceType, WORD_LENGTH);
  });
  omitWhen(model.resourceModelType !== 'account', () => {
    stringValidations('resourceType', model.resourceType, WORD_LENGTH);
  });

  dateValidations('startDate', model.startDate);
  timeValidations('startTime', model.startTime);
  dateValidations('endDate', model.endDate);
  timeValidations('endTime', model.endTime);

  stringValidations('numberOfParticipants', model.numberOfParticipants, SHORT_NAME_LENGTH);
  stringValidations('area', model.area, SHORT_NAME_LENGTH);
  stringValidations('reservationRef', model.reservationRef, SHORT_NAME_LENGTH);
  stringValidations('reservationState', model.reservationState, WORD_LENGTH);
  stringValidations('reservationReason', model.reservationReason, WORD_LENGTH);
  numberValidations('order', model.order, true, 0, 10);

  numberValidations('price', model.price, false, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  stringValidations('periodicity', model.periodicity, WORD_LENGTH);

   // cross field validations
  omitWhen(model.startDate === '' || model.endDate === '', () => {
    test('endDate', '@reservationEndAfterStartDate', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterOrEqualDate(model.endDate!, model.startDate!)).isTruthy();
    });
  });

  // tbd: cross reference resourceKey in resources
  // tbd: cross reference reserverKey in persons
});





