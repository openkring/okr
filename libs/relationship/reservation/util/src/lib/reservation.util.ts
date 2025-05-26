import { END_FUTURE_DATE_STR } from "@bk2/shared/config";
import { GenderType, ModelType, OrgModel, Periodicity, PersonModel, ReservationModel, ReservationReason, ReservationState, ResourceModel, ResourceType, UserModel } from "@bk2/shared/models";
import { addIndexElement, die, getTodayStr, isType } from "@bk2/shared/util";
import { ReservationFormModel } from "./reservation-form.model";
import { ReservationNewFormModel } from "./reservation-new-form.model";

export function newReservationFormModel(): ReservationFormModel {
  return {
  bkey: '',
  tags: '',
  notes: '',
  name: '',

  reserverKey: '',
  reserverName: '',
  reserverName2: '',
  reserverModelType: ModelType.Person,
  reserverType: GenderType.Male,

  resourceKey: '',
  resourceName: '',
  resourceModelType: ModelType.Resource,
  resourceType: ResourceType.RowingBoat,
  resourceSubType: GenderType.Male,

  startDate: getTodayStr(),
  startTime: '',
  endDate: END_FUTURE_DATE_STR,
  endTime: '',
  numberOfParticipants: '',
  area: '',
  reservationRef: '',
  reservationState: ReservationState.Active,
  reservationReason: ReservationReason.SocialEvent,
  priority: 0,

  price: 0,
  currency: 'CHF',
  periodicity: Periodicity.Once
  }
}

export function convertReservationToForm(reservation: ReservationModel | undefined): ReservationFormModel {
  if (!reservation) return newReservationFormModel();
  return {
    bkey: reservation.bkey ?? '',
    tags: reservation.tags ?? '',
    notes: reservation.notes ?? '',
    name: reservation.name ?? '',

    reserverKey: reservation.reserverKey ?? '',
    reserverName: reservation.reserverName ?? '',
    reserverName2: reservation.reserverName2 ?? '',
    reserverModelType: reservation.reserverModelType,
    reserverType: reservation.reserverType,

    resourceKey: reservation.resourceKey ?? '',
    resourceName: reservation.resourceName ?? '',
    resourceModelType: reservation.resourceModelType,
    resourceType: reservation.resourceType,
    resourceSubType: reservation.resourceSubType,
    startDate: reservation.startDate ?? getTodayStr(),
    startTime: reservation.startTime ?? '',
    endDate: reservation.endDate ?? END_FUTURE_DATE_STR,
    endTime: reservation.endTime ?? '',
    numberOfParticipants: reservation.numberOfParticipants ?? '',
    area: reservation.area ?? '',
    reservationRef: reservation.reservationRef ?? '',
    reservationState: reservation.reservationState ?? ReservationState.Active,
    reservationReason: reservation.reservationReason ?? ReservationReason.SocialEvent,
    priority: reservation.priority ?? 0,
    price: reservation.price ?? 0,
    currency: reservation.currency ?? 'CHF',
    periodicity: reservation.periodicity ?? Periodicity.Once
  }
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
    reservation.bkey = vm.bkey ?? '';
  }
  reservation.tags = vm.tags ?? '';
  reservation.notes = vm.notes ?? '';
  reservation.name = vm.name ?? '';
  reservation.reserverKey = vm.reserverKey ?? '';
  reservation.reserverName = vm.reserverName ?? '';
  reservation.reserverName2 = vm.reserverName2 ?? '';
  reservation.reserverModelType = vm.reserverModelType ?? ModelType.Person; 
  reservation.reserverType = vm.reserverType ?? GenderType.Male;
  reservation.resourceKey = vm.resourceKey ?? '';
  reservation.resourceName = vm.resourceName ?? '';
  reservation.resourceModelType = vm.resourceModelType ?? ModelType.Resource;
  reservation.resourceType = vm.resourceType ?? ResourceType.RowingBoat;
  reservation.resourceSubType = vm.resourceSubType ?? GenderType.Male;
  reservation.startDate = vm.startDate ?? getTodayStr();
  reservation.startTime = vm.startTime ?? '';
  reservation.endDate = vm.endDate ?? END_FUTURE_DATE_STR;
  reservation.endTime = vm.endTime ?? '';
  reservation.numberOfParticipants = vm.numberOfParticipants ?? '';
  reservation.area = vm.area ?? '';
  reservation.reservationRef = vm.reservationRef ?? '';
  reservation.reservationState = vm.reservationState ?? ReservationState.Active;
  reservation.reservationReason = vm.reservationReason ?? ReservationReason.SocialEvent;
  reservation.priority = vm.priority ?? 0;
  reservation.price = vm.price ?? 0;
  reservation.currency = vm.currency ?? 'CHF';
  reservation.periodicity = vm.periodicity ?? Periodicity.Once;
  return reservation;
}

export function convertReserverAndResourceToNewForm(reserver: PersonModel | OrgModel, resource: ResourceModel, currentUser?: UserModel, modelType?: ModelType): ReservationNewFormModel {  
  if (!currentUser) die('reservation.util.convertReserverAndResourceToNewForm: currentUser is mandatory');
  if (!modelType) die('reservation.util.convertReserverAndResourceToNewForm: modelType is mandatory');

  if (modelType === ModelType.Person) {
    const _person = reserver as PersonModel;
    return {
      tags: '',
      notes: '',
      name: '',
      reserverKey: _person.bkey,
      reserverName: _person.firstName,
      reserverName2: _person.lastName,
      reserverModelType: ModelType.Person,
      reserverType: _person.gender,

      resourceKey: resource.bkey,
      resourceName: resource.name,
      resourceModelType: ModelType.Resource,
      resourceType: resource.type,
      resourceSubType: resource.subType,

      startDate: getTodayStr(),
      startTime: '',
      endDate: END_FUTURE_DATE_STR,
      endTime: '',
      numberOfParticipants: '',
      area: '',
      reservationRef: '',
      reservationState: ReservationState.Active,
      reservationReason: ReservationReason.SocialEvent,
      priority: 0,

      price: 0,
      currency: 'CHF',
      periodicity: Periodicity.Once
    }
  }
  if (modelType === ModelType.Org) {
    const _org = reserver as OrgModel;
    return {
      tags: '',
      notes: '',
      name: '',
      reserverKey: _org.bkey,
      reserverName: '',
      reserverName2: _org.name,
      reserverModelType: ModelType.Org,
      reserverType: _org.type,

      resourceKey: resource.bkey,
      resourceName: resource.name,
      resourceModelType: ModelType.Resource,
      resourceType: resource.type,
      resourceSubType: resource.subType,

      startDate: getTodayStr(),
      startTime: '',
      endDate: END_FUTURE_DATE_STR,
      endTime: '',
      numberOfParticipants: '',
      area: '',
      reservationRef: '',
      reservationState: ReservationState.Active,
      reservationReason: ReservationReason.SocialEvent,
      priority: 0,

      price: 0,
      currency: 'CHF',
      periodicity: Periodicity.Once
    }
  }
  else {
    die('reservation.util.convertReserverAndResourceToNewForm: modelType is not Person or Org');
  }
}

export function convertFormToNewReservation(vm: ReservationFormModel, tenantId: string): ReservationModel {
  const _reservation = new ReservationModel(tenantId);
  _reservation.tenants = [tenantId];
  _reservation.isArchived = false;
  _reservation.tags = vm.tags ?? '';
  _reservation.notes = vm.notes ?? '';
  _reservation.name = vm.name ?? '';
  _reservation.reserverKey = vm.reserverKey ?? '';
  _reservation.reserverName = vm.reserverName ?? '';
  _reservation.reserverName2 = vm.reserverName2 ?? '';
  _reservation.reserverModelType = vm.reserverModelType ?? ModelType.Person;
  _reservation.reserverType = vm.reserverType ?? GenderType.Male;
  _reservation.resourceKey = vm.resourceKey ?? '';
  _reservation.resourceName = vm.resourceName ?? '';
  _reservation.resourceModelType = vm.resourceModelType ?? ModelType.Resource;
  _reservation.resourceType = vm.resourceType ?? ResourceType.RowingBoat;
  _reservation.resourceSubType = vm.resourceSubType ?? GenderType.Male;
  _reservation.startDate = vm.startDate ?? getTodayStr();
  _reservation.startTime = vm.startTime ?? '';
  _reservation.endDate = vm.endDate ?? END_FUTURE_DATE_STR;
  _reservation.endTime = vm.endTime ?? '';
  _reservation.numberOfParticipants = vm.numberOfParticipants ?? '';
  _reservation.area = vm.area ?? '';
  _reservation.reservationRef = vm.reservationRef ?? '';
  _reservation.reservationState = vm.reservationState ?? ReservationState.Active;
  _reservation.reservationReason = vm.reservationReason ?? ReservationReason.SocialEvent;
  _reservation.priority = vm.priority ?? 0;
  _reservation.price = vm.price ?? 0;
  _reservation.currency = vm.currency ?? 'CHF';
  _reservation.periodicity = vm.periodicity ?? Periodicity.Once;
  return _reservation;
}

export function getReserverName(reservation: ReservationModel): string {
  // tbd: consider NameDisplay
  if (reservation.reserverModelType === ModelType.Person) {
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
  let _index = '';
  _index = addIndexElement(_index, 'rn', reservation.reserverName + ' ' + reservation.reserverName2);
  _index = addIndexElement(_index, 'rk', reservation.reserverKey)
  _index = addIndexElement(_index, 'resn', reservation.resourceName);
  _index = addIndexElement(_index, 'resk', reservation.resourceKey);
  return _index;  
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getReservationSearchIndexInfo(): string {
  return 'rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ';
}