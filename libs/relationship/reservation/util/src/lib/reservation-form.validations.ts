import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CURRENCY_LENGTH, DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { AccountType, GenderType, ModelType, OrgType, Periodicity, ReservationReason, ReservationState, ResourceType } from '@bk2/shared-models';
import { categoryValidations, dateValidations, isAfterOrEqualDate, numberValidations, stringValidations, timeValidations } from '@bk2/shared-util-core';

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
  categoryValidations('reserverModelType', model.reserverModelType, ModelType); // tbd: if Person: gender, else orgType
  omitWhen(model.reserverModelType !== ModelType.Person, () => {
    categoryValidations('reserverType', model.reserverType, GenderType);
  });
  omitWhen(model.reserverModelType !== ModelType.Org, () => {
    categoryValidations('reserverType', model.reserverType, OrgType);
  });

  // resource
  stringValidations('resourceKey', model.resourceKey, SHORT_NAME_LENGTH);
  stringValidations('resourceName', model.resourceName, SHORT_NAME_LENGTH);
  categoryValidations('resourceModelType', model.resourceModelType, ModelType); // Resource or Account
  omitWhen(model.resourceModelType !== ModelType.Resource, () => {
    categoryValidations('resourceType', model.resourceType, ResourceType);
  });
  omitWhen(model.resourceModelType !== ModelType.Account, () => {
    categoryValidations('resourceType', model.resourceType, AccountType);
  });

  dateValidations('startDate', model.startDate);
  timeValidations('startTime', model.startTime);
  dateValidations('endDate', model.endDate);
  timeValidations('endTime', model.endTime);

  stringValidations('numberOfParticipants', model.numberOfParticipants, SHORT_NAME_LENGTH);
  stringValidations('area', model.area, SHORT_NAME_LENGTH);
  stringValidations('reservationRef', model.reservationRef, SHORT_NAME_LENGTH);
  categoryValidations('reservationState', model.reservationState, ReservationState);
  categoryValidations('reservationReason', model.reservationReason, ReservationReason);
  numberValidations('priority', model.priority, true, 0, 10);

  numberValidations('price', model.price, false, 0, 1000000);
  stringValidations('currency', model.currency, CURRENCY_LENGTH);
  categoryValidations('periodicity', model.periodicity, Periodicity);

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





