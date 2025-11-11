import { DEFAULT_CURRENCY, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_RBOAT_TYPE, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TIME, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { OrgModel, PersonModel, ReservationModel, ResourceModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr, isType } from '@bk2/shared-util-core';

import { ReservationFormModel } from './reservation-form.model';
import { ReservationNewFormModel } from './reservation-new-form.model';

export function newReservationFormModel(): ReservationFormModel {
  return {
    bkey: DEFAULT_KEY,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,
    name: DEFAULT_NAME,

    reserverKey: DEFAULT_KEY,
    reserverName: DEFAULT_NAME,
    reserverName2: DEFAULT_NAME,
    reserverModelType: 'person',
    reserverType: DEFAULT_GENDER,

    resourceKey: DEFAULT_KEY,
    resourceName: DEFAULT_NAME,
    resourceModelType: 'resource',
    resourceType: DEFAULT_RESOURCE_TYPE,
    resourceSubType: DEFAULT_RBOAT_TYPE,

    startDate: getTodayStr(),
    startTime: DEFAULT_TIME,
    endDate: END_FUTURE_DATE_STR,
    endTime: DEFAULT_TIME,
    numberOfParticipants: '',
    area: '',
    reservationRef: '',
    reservationState: DEFAULT_RES_STATE,
    reservationReason: DEFAULT_RES_REASON,
    order: DEFAULT_ORDER,

    price: DEFAULT_PRICE,
    currency: DEFAULT_CURRENCY,
    periodicity: DEFAULT_PERIODICITY,
  };
}

export function convertReservationToForm(reservation: ReservationModel | undefined): ReservationFormModel {
  if (!reservation) return newReservationFormModel();
  return {
    bkey: reservation.bkey ?? DEFAULT_KEY,
    tags: reservation.tags ?? DEFAULT_TAGS,
    notes: reservation.notes ?? DEFAULT_NOTES,
    name: reservation.name ?? DEFAULT_NAME,

    reserverKey: reservation.reserverKey ?? DEFAULT_KEY,
    reserverName: reservation.reserverName ?? DEFAULT_NAME,
    reserverName2: reservation.reserverName2 ?? DEFAULT_NAME,
    reserverModelType: reservation.reserverModelType,
    reserverType: reservation.reserverType,

    resourceKey: reservation.resourceKey ?? DEFAULT_KEY,
    resourceName: reservation.resourceName ?? DEFAULT_NAME,
    resourceModelType: reservation.resourceModelType,
    resourceType: reservation.resourceType,
    resourceSubType: reservation.resourceSubType,
    startDate: reservation.startDate ?? getTodayStr(),
    startTime: reservation.startTime ?? DEFAULT_TIME,
    endDate: reservation.endDate ?? END_FUTURE_DATE_STR,
    endTime: reservation.endTime ?? DEFAULT_TIME,
    numberOfParticipants: reservation.numberOfParticipants ?? '',
    area: reservation.area ?? '',
    reservationRef: reservation.reservationRef ?? '',
    reservationState: reservation.reservationState ?? DEFAULT_RES_STATE,
    reservationReason: reservation.reservationReason ?? DEFAULT_RES_REASON,
    order: reservation.order ?? DEFAULT_ORDER,
    price: reservation.price ?? DEFAULT_PRICE,
    currency: reservation.currency ?? DEFAULT_CURRENCY,
    periodicity: reservation.periodicity ?? DEFAULT_PERIODICITY,
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param reservation the reservation to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated membership.
 */
export function convertFormToReservation(reservation: ReservationModel | undefined, vm: ReservationFormModel, tenantId: string): ReservationModel {
  if (!reservation) {
    reservation = new ReservationModel(tenantId);
    reservation.bkey = vm.bkey ?? DEFAULT_KEY;
  }
  reservation.tags = vm.tags ?? DEFAULT_TAGS;
  reservation.notes = vm.notes ?? DEFAULT_NOTES;
  reservation.name = vm.name ?? DEFAULT_NAME;
  reservation.reserverKey = vm.reserverKey ?? DEFAULT_KEY;
  reservation.reserverName = vm.reserverName ?? DEFAULT_NAME;
  reservation.reserverName2 = vm.reserverName2 ?? DEFAULT_NAME;
  reservation.reserverModelType = vm.reserverModelType ?? 'person';
  reservation.reserverType = vm.reserverType ?? DEFAULT_GENDER;
  reservation.resourceKey = vm.resourceKey ?? DEFAULT_KEY;
  reservation.resourceName = vm.resourceName ?? DEFAULT_NAME;
  reservation.resourceModelType = vm.resourceModelType ?? 'resource';
  reservation.resourceType = vm.resourceType ?? DEFAULT_RESOURCE_TYPE;
  reservation.resourceSubType = vm.resourceSubType ?? DEFAULT_RBOAT_TYPE;
  reservation.startDate = vm.startDate ?? getTodayStr();
  reservation.startTime = vm.startTime ?? DEFAULT_TIME;
  reservation.endDate = vm.endDate ?? END_FUTURE_DATE_STR;
  reservation.endTime = vm.endTime ?? DEFAULT_TIME;
  reservation.numberOfParticipants = vm.numberOfParticipants ?? '';
  reservation.area = vm.area ?? '';
  reservation.reservationRef = vm.reservationRef ?? '';
  reservation.reservationState = vm.reservationState ?? DEFAULT_RES_STATE;
  reservation.reservationReason = vm.reservationReason ?? DEFAULT_RES_REASON;
  reservation.order = vm.order ?? DEFAULT_ORDER;
  reservation.price = vm.price ?? DEFAULT_PRICE;
  reservation.currency = vm.currency ?? DEFAULT_CURRENCY;
  reservation.periodicity = vm.periodicity ?? DEFAULT_PERIODICITY;
  return reservation;
}

export function convertReserverAndResourceToNewForm(reserver: PersonModel | OrgModel, resource: ResourceModel, currentUser?: UserModel, modelType?: string): ReservationNewFormModel {
  if (!currentUser) die('reservation.util.convertReserverAndResourceToNewForm: currentUser is mandatory');
  if (!modelType) die('reservation.util.convertReserverAndResourceToNewForm: modelType is mandatory');

  if (modelType === 'person') {
    const person = reserver as PersonModel;
    return {
      tags: DEFAULT_TAGS,
      notes: DEFAULT_NOTES,
      name: DEFAULT_NAME,
      reserverKey: person.bkey,
      reserverName: person.firstName,
      reserverName2: person.lastName,
      reserverModelType: 'person',
      reserverType: person.gender,

      resourceKey: resource.bkey,
      resourceName: resource.name,
      resourceModelType: 'resource',
      resourceType: resource.type,
      resourceSubType: resource.subType,

      startDate: getTodayStr(),
      startTime: DEFAULT_TIME,
      endDate: END_FUTURE_DATE_STR,
      endTime: DEFAULT_TIME,
      numberOfParticipants: '',
      area: '',
      reservationRef: '',
      reservationState: DEFAULT_RES_STATE,
      reservationReason: DEFAULT_RES_REASON,
      order: DEFAULT_ORDER,

      price: DEFAULT_PRICE,
      currency: DEFAULT_CURRENCY,
      periodicity: DEFAULT_PERIODICITY,
    };
  }
  if (modelType === 'org') {
    const _org = reserver as OrgModel;
    return {
      tags: DEFAULT_TAGS,
      notes: DEFAULT_NOTES,
      name: DEFAULT_NAME,
      reserverKey: _org.bkey,
      reserverName: DEFAULT_NAME,
      reserverName2: _org.name,
      reserverModelType: 'org',
      reserverType: _org.type,

      resourceKey: resource.bkey,
      resourceName: resource.name,
      resourceModelType: 'resource',
      resourceType: resource.type,
      resourceSubType: resource.subType,

      startDate: getTodayStr(),
      startTime: DEFAULT_TIME,
      endDate: END_FUTURE_DATE_STR,
      endTime: DEFAULT_TIME,
      numberOfParticipants: '',
      area: '',
      reservationRef: '',
      reservationState: DEFAULT_RES_STATE,
      reservationReason: DEFAULT_RES_REASON,
      order: DEFAULT_ORDER,

      price: DEFAULT_PRICE,
      currency: DEFAULT_CURRENCY,
      periodicity: DEFAULT_PERIODICITY,
    };
  } else {
    die('reservation.util.convertReserverAndResourceToNewForm: modelType is not Person or Org');
  }
}

export function convertFormToNewReservation(vm: ReservationFormModel, tenantId: string): ReservationModel {
  const reservation = new ReservationModel(tenantId);
  reservation.tenants = [tenantId];
  reservation.isArchived = false;
  reservation.tags = vm.tags ?? DEFAULT_TAGS;
  reservation.notes = vm.notes ?? DEFAULT_NOTES;
  reservation.name = vm.name ?? DEFAULT_NAME;
  reservation.reserverKey = vm.reserverKey ?? DEFAULT_KEY;
  reservation.reserverName = vm.reserverName ?? DEFAULT_NAME;
  reservation.reserverName2 = vm.reserverName2 ?? DEFAULT_NAME;
  reservation.reserverModelType = vm.reserverModelType ?? 'person';
  reservation.reserverType = vm.reserverType ?? DEFAULT_GENDER;
  reservation.resourceKey = vm.resourceKey ?? DEFAULT_KEY;
  reservation.resourceName = vm.resourceName ?? DEFAULT_NAME;
  reservation.resourceModelType = vm.resourceModelType ?? 'resource';
  reservation.resourceType = vm.resourceType ?? DEFAULT_RESOURCE_TYPE;
  reservation.resourceSubType = vm.resourceSubType ?? DEFAULT_GENDER;
  reservation.startDate = vm.startDate ?? getTodayStr();
  reservation.startTime = vm.startTime ?? DEFAULT_TIME;
  reservation.endDate = vm.endDate ?? END_FUTURE_DATE_STR;
  reservation.endTime = vm.endTime ?? DEFAULT_TIME;
  reservation.numberOfParticipants = vm.numberOfParticipants ?? '';
  reservation.area = vm.area ?? '';
  reservation.reservationRef = vm.reservationRef ?? '';
  reservation.reservationState = vm.reservationState ?? DEFAULT_RES_STATE;
  reservation.reservationReason = vm.reservationReason ?? DEFAULT_RES_REASON;
  reservation.order = vm.order ?? DEFAULT_ORDER;
  reservation.price = vm.price ?? DEFAULT_PRICE;
  reservation.currency = vm.currency ?? DEFAULT_CURRENCY;
  reservation.periodicity = vm.periodicity ?? DEFAULT_PERIODICITY;
  return reservation;
}

export function getReserverName(reservation: ReservationModel): string {
  // tbd: consider NameDisplay
  if (reservation.reserverModelType === 'person') {
    return `${reservation.reserverName} ${reservation.reserverName2}`;
  } else {
    return reservation.reserverName2;
  }
}

export function isReservation(reservation: unknown, tenantId: string): reservation is ReservationModel {
  return isType(reservation, new ReservationModel(tenantId));
}

/************************************************* Search Index ********************************************************** */
export function getReservationSearchIndex(reservation: ReservationModel): string {
  let index = '';
  index = addIndexElement(index, 'rn', reservation.reserverName + ' ' + reservation.reserverName2);
  index = addIndexElement(index, 'rk', reservation.reserverKey);
  index = addIndexElement(index, 'resn', reservation.resourceName);
  index = addIndexElement(index, 'resk', reservation.resourceKey);
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getReservationSearchIndexInfo(): string {
  return 'rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ';
}
