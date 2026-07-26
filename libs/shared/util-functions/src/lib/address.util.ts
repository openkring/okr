import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressCollection, AddressModel, OrgCollection, PersonCollection } from '@okr/shared-models';

/**
 * If an address changes, update the cached favorite zip code in its parent document (person or org).
 * favEmail/favPhone are no longer replicated to the parent (spec 1.19 Phase 4 strip) —
 * contact data is served by the address-directory projection instead.
 * @param firestore a handle to Firestore database
 * @param addressId the key to the address data
 */
export async function updateFavoriteZipCode(firestore: Firestore, address: AddressModel, addressId: string): Promise<void> {
  logger.info(`Address change for ${AddressCollection}/${addressId}`);
  let parentId: string | undefined;
  let parentCollection: 'persons' | 'orgs' | undefined;
  if (address.parentKey.startsWith('person.')) {
    parentId = address.parentKey.substring('person.'.length);
    parentCollection = PersonCollection;
  }
  if (address.parentKey.startsWith('org.')) {
    parentId = address.parentKey.substring('org.'.length);
    parentCollection = OrgCollection;
  }
  if (!parentId || !parentCollection) return;

  try {
    const favZipCode = await getFavoriteZipCode(firestore, address.parentKey);
    logger.info(`Updating favorite zip code for ${parentCollection}/${parentId}`, { favZipCode });
    const ref = admin.firestore().doc(`${parentCollection}/${parentId}`);
    await ref.update({ favZipCode });
    logger.info(`Successfully updated favorite zip code for ${parentCollection}/${parentId}`);
  } catch (error) {
    logger.error(`Error updating ${parentCollection}/${parentId}:`, error);
  }
}

/**
 * Extracts the favorite postal zip code for a given person or org.
 * @param firestore a handle to firestore database
 * @param parentKey  the key to the parent document of the address (e.g. person.{okey} or org.{okey})
 * @returns the zip code of the favorite postal address (empty string if none exists)
 */
async function getFavoriteZipCode(firestore: Firestore, parentKey: string): Promise<string> {
  let query: FirebaseFirestore.Query = firestore.collection(AddressCollection);
  query = query.where('parentKey', '==', parentKey).where('isFavorite', '==', true);
  const snapshot = await query.get();
  if (snapshot.empty) {
    logger.info(`getFavoriteZipCode: no favorite addresses found for ${parentKey}`);
    return '';
  }
  const favoriteAddresses = snapshot.docs.map(doc => {
    return { ...doc.data(), okey: doc.id } as AddressModel;
  });
  logger.info(`getFavoriteZipCode: found ${favoriteAddresses.length} favorite addresses for ${parentKey}`);
  const favoritePostal = favoriteAddresses.find((a) => a.addressChannel === 'postal');
  return favoritePostal?.zipCode ?? '';
}
