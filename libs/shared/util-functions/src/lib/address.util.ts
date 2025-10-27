import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressChannel, AddressModel } from '@bk2/shared-models';
import { die } from '@bk2/shared-util-core';

export interface FavoriteAddressInfo {
  fav_email: string;
  fav_phone: string;
  fav_street_name: string;
  fav_street_number: string;
  fav_zip_code: string;
  fav_city: string;
  fav_country_code: string;
  fav_web: string;
}

/**
 * If an address changes, update the corresponding cached address data in its parent document (person or org).
 * @param firestore a handle to Firestore database
 * @param parentId the key to the parent document of the address
 * @param parentCollection the collection name of the addresses parent document (persons or orgs)
 */
export async function updateFavoriteAddressInfo(firestore: Firestore, parentId: string, parentCollection: 'persons' | 'orgs'): Promise<void> {
  logger.info(`Address change for ${parentCollection}/${parentId}`);
  const ref = admin.firestore().doc(`${parentCollection}/${parentId}`);

  try {
    const favoriteAddressInfo = await getFavoriteAddressInfo(firestore, parentId, parentCollection);
    logger.info(`Updating favorite address info for ${parentCollection}/${parentId}`, favoriteAddressInfo);
    await ref.update({
      fav_email: favoriteAddressInfo.fav_email,
      fav_phone: favoriteAddressInfo.fav_phone,
      fav_street_name: favoriteAddressInfo.fav_street_name,
      fav_street_number: favoriteAddressInfo.fav_street_number,
      fav_zip_code: favoriteAddressInfo.fav_zip_code,
      fav_city: favoriteAddressInfo.fav_city,
      fav_country_code: favoriteAddressInfo.fav_country_code,
    });
    logger.info(`Successfully updated favorite address info for ${parentCollection}/${parentId}`);
  } catch (error) {
    logger.error(`Error updating ${parentCollection}/${parentId}:`, error);
  }
}

/**
 * Extracts the favorite address info for a given person or org. 
 * @param firestore a handle to firestore database
 * @param parentId  the key to the parent document of the address
 * @param parentCollection the collection name of the addresses parent document (persons or orgs)
 * @returns FavoriteAddressInfo, i.e. the data that is cached in teh parent document.
 */
async function getFavoriteAddressInfo(firestore: Firestore, parentId: string, parentCollection: 'persons' | 'orgs'): Promise<FavoriteAddressInfo> {
  const collection = `${parentCollection}/${parentId}/addresses`;
  let query: FirebaseFirestore.Query = firestore.collection(collection);
  query = query.where('isFavorite', '==', true);
  const favoriteAddressInfo = getEmptyFavoriteAddressInfo();
  const snapshot = await query.get();
  if (snapshot.empty) {
    logger.info(`getFavoriteAddressInfo: no favorite addresses found for ${parentCollection}/${parentId})`);
  } else {
    const favoriteAddresses = snapshot.docs.map(doc => {
      return { ...doc.data(), bkey: doc.id } as AddressModel;
    });
    logger.info(`getFavoriteAddressInfo: found ${favoriteAddresses.length} favorite addresses for ${parentCollection}/${parentId}`);
    for (const favoriteAddress of favoriteAddresses) {
      switch (favoriteAddress.channelType) {
        case AddressChannel.Email:
          favoriteAddressInfo.fav_email = favoriteAddress.email;
          break;
        case AddressChannel.Phone:
          favoriteAddressInfo.fav_phone = favoriteAddress.phone;
          break;
        case AddressChannel.Postal:
          favoriteAddressInfo.fav_street_name = favoriteAddress.streetName;
          favoriteAddressInfo.fav_street_number = favoriteAddress.streetNumber;
          favoriteAddressInfo.fav_zip_code = favoriteAddress.zipCode;
          favoriteAddressInfo.fav_city = favoriteAddress.city;
          favoriteAddressInfo.fav_country_code = favoriteAddress.countryCode;
          break;
        case AddressChannel.Web:
          favoriteAddressInfo.fav_web = favoriteAddress.url;
          break;
        default:
          die(`AddressUtil.getEmptyFavoriteAddressInfo: unknown channel type ${favoriteAddress.channelType}`);
      }
    }
  }
  return favoriteAddressInfo;
}

function getEmptyFavoriteAddressInfo(): FavoriteAddressInfo {
  return {
    fav_email: '',
    fav_phone: '',
    fav_street_name: '',
    fav_street_number: '',
    fav_zip_code: '',
    fav_city: '',
    fav_country_code: '',
    fav_web: '',
  };
}
