import { ReservationModel } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

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

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given person based on its values.
 * @param person the person for which to create the index
 * @returns the index string
 */
export function getReservationIndex(reservation: ReservationModel): string {
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
export function getReservationIndexInfo(): string {
  return 'rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ';
}
