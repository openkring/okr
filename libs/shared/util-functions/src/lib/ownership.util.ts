import { OwnershipCollection, OwnershipModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';

/**
 * Retrieves all ownerships of an owner (i.e. person or org).
 *
 * `ownerModelType` MUST be passed to disambiguate the polymorphic owner key: `ownerKey`
 * can point to a person or an org, which live in separate collections and may share a key.
 * Without the type filter a person write could clobber an org's ownerships and vice versa.
 * @param firestore
 * @param ownerId the id of the person/org to retrieve the ownerships for
 * @param ownerModelType filter to ownerships whose owner is a 'person' or an 'org'
 * @returns an array of ownerships for the given owner.
 */
export async function getAllOwnershipsOfOwner(firestore: Firestore, ownerId: string, ownerModelType: 'person' | 'org'): Promise<OwnershipModel[]> {
  const query = [
    { key: 'ownerKey', operator: '==', value: ownerId },
    { key: 'ownerModelType', operator: '==', value: ownerModelType },
  ];
  return await searchData<OwnershipModel>(firestore, OwnershipCollection, query, 'resourceName', 'asc');
}

/**
 * Retrieves all ownerships of a resource (i.e. resource or account).
 *
 * The owned object is stored on the flat `resourceKey`/`resourceModelType` fields (NOT
 * `objectKey` — that was a stale field name that returned nothing). `resourceModelType`
 * MUST be passed to disambiguate the polymorphic key: `resourceKey` can point to a
 * resource or an account, which live in separate collections and may share a key.
 * @param firestore
 * @param resourceId the id of the resource/account to retrieve the ownerships for
 * @param resourceModelType filter to ownerships whose object is a 'resource' or an 'account'
 * @returns an array of ownerships for the given resource.
 */
export async function getAllOwnershipsOfResource(firestore: Firestore, resourceId: string, resourceModelType: 'resource' | 'account'): Promise<OwnershipModel[]> {
  const query = [
    { key: 'resourceKey', operator: '==', value: resourceId },
    { key: 'resourceModelType', operator: '==', value: resourceModelType },
  ];
  return await searchData<OwnershipModel>(firestore, OwnershipCollection, query, 'ownerName2', 'asc');
}
