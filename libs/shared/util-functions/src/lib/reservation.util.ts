import { ReservationCollection, ReservationModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all reservations for a given reserver (person or org).
 *
 * The reserver is stored as a nested `reserver` AvatarInfo map, so we query the dotted
 * field paths `reserver.key`/`reserver.modelType` (NOT the flat `reserverKey` that never
 * existed on the model). `reserverModelType` MUST be passed to disambiguate the polymorphic
 * key: `reserver.key` can point to a person or an org, which may share a key.
 * @param firestore
 * @param reserverId the id of the reserver (person/org) to retrieve its reservations for
 * @param reserverModelType filter to reservations whose reserver is a 'person' or an 'org'
 * @returns an array of reservations for the given reserver.
 */
export async function getAllReservationsOfReserver(firestore: Firestore, reserverId: string, reserverModelType: 'person' | 'org'): Promise<ReservationModel[]> {
  const query = [
    { key: 'reserver.key', operator: '==', value: reserverId },
    { key: 'reserver.modelType', operator: '==', value: reserverModelType },
  ];
  return await searchData<ReservationModel>(firestore, ReservationCollection, query, 'startDate', 'asc');
}

/**
 * Retrieves all reservations for a given resource (resource or account).
 *
 * The resource is stored as a nested `resource` AvatarInfo map, so we query the dotted
 * field paths `resource.key`/`resource.modelType` (NOT the flat `resourceKey`).
 * `resourceModelType` MUST be passed to disambiguate the polymorphic key: `resource.key`
 * can point to a resource or an account, which may share a key.
 * @param firestore
 * @param resourceId the id of the resource/account to retrieve its reservations for
 * @param resourceModelType filter to reservations whose resource is a 'resource' or an 'account'
 * @returns an array of reservations for the given resource.
 */
export async function getAllReservationsOfResource(firestore: Firestore, resourceId: string, resourceModelType: 'resource' | 'account'): Promise<ReservationModel[]> {
  const query = [
    { key: 'resource.key', operator: '==', value: resourceId },
    { key: 'resource.modelType', operator: '==', value: resourceModelType },
  ];
  return await searchData<ReservationModel>(firestore, ReservationCollection, query, 'startDate', 'asc');
}
