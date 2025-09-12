import { OwnershipCollection, OwnershipModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all ownerships of an owner (i.e. person or org).
 * @param firestore
 * @param ownerId the id of the person to retrieve the ownerships for
 * @returns an array of ownerships for the given person.
 */
export async function getAllOwnershipsOfOwner(firestore: Firestore, ownerId: string): Promise<OwnershipModel[]> {
  const _query = [{ key: 'ownerKey', operator: '==', value: ownerId }];
  return await searchData<OwnershipModel>(firestore, OwnershipCollection, _query, 'resourceName', 'asc');
}

/**
 * Retrieves all ownerships of a resource.
 * @param firestore
 * @param resourceId the id of the resource to retrieve the ownerships for
 * @returns an array of ownerships for the given resource.
 */
export async function getAllOwnershipsOfResource(firestore: Firestore, resourceId: string): Promise<OwnershipModel[]> {
  const _query = [{ key: 'objectKey', operator: '==', value: resourceId }];
  return await searchData<OwnershipModel>(firestore, OwnershipCollection, _query, 'ownerName2', 'asc');
}
