import { ReservationModel } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

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
  const reserver = reservation.reserver;
  if (reserver) {
    index = addIndexElement(index, 'rn', reserver.name1 + ' ' + reserver.name2);
    index = addIndexElement(index, 'rk', reserver.key);
  }
  const resource = reservation.resource;
  if (resource) {
    index = addIndexElement(index, 'resn', resource.name1 + ' ' + resource.name2);
    index = addIndexElement(index, 'resk', resource.key);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getReservationIndexInfo(): string {
  return 'rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ';
}
