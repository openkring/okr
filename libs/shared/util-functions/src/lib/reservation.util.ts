import { ReservationCollection, ReservationModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all reservations for a given reserver.
 * @param firestore
 * @param reserverId the id of the reserver to retrieve its reservations for
 * @returns an array of reservations for the given reserver.
 */
export async function getAllReservationsOfReserver(firestore: Firestore, reserverId: string): Promise<ReservationModel[]> {
  const _query = [{ key: 'reserverKey', operator: '==', value: reserverId }];
  return await searchData<ReservationModel>(firestore, ReservationCollection, _query, 'resourceName', 'asc');
}

/**
 * Retrieves all reservations for a given resource.
 * @param firestore
 * @param resourceId the id of the resource to retrieve its reservations for
 * @returns an array of reservations for the given resource.
 */
export async function getAllReservationsOfResource(firestore: Firestore, resourceId: string): Promise<ReservationModel[]> {
  const _query = [{ key: 'resourceKey', operator: '==', value: resourceId }];
  return await searchData<ReservationModel>(firestore, ReservationCollection, _query, 'reserverName2', 'asc');
}
