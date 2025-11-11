import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressChannel, AddressModel } from '@bk2/shared-models';
import { die } from '@bk2/shared-util-core';
import { DEFAULT_EMAIL, DEFAULT_NAME, DEFAULT_PHONE, DEFAULT_URL } from '@bk2/shared-constants';

export interface FavoriteAddressInfo {
  favEmail: string;
  favPhone: string;
  favStreetName: string;
  favStreetNumber: string;
  favZipCode: string;
  favCity: string;
  favCountryCode: string;
  favWeb: string;
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
      favEmail: favoriteAddressInfo.favEmail,
      favPhone: favoriteAddressInfo.favPhone,
      favStreetName: favoriteAddressInfo.favStreetName,
      favStreetNumber: favoriteAddressInfo.favStreetNumber,
      favZipCode: favoriteAddressInfo.favZipCode,
      favCity: favoriteAddressInfo.favCity,
      favCountryCode: favoriteAddressInfo.favCountryCode,
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
          favoriteAddressInfo.favEmail = favoriteAddress.email;
          break;
        case AddressChannel.Phone:
          favoriteAddressInfo.favPhone = favoriteAddress.phone;
          break;
        case AddressChannel.Postal:
          favoriteAddressInfo.favStreetName = favoriteAddress.streetName;
          favoriteAddressInfo.favStreetNumber = favoriteAddress.streetNumber;
          favoriteAddressInfo.favZipCode = favoriteAddress.zipCode;
          favoriteAddressInfo.favCity = favoriteAddress.city;
          favoriteAddressInfo.favCountryCode = favoriteAddress.countryCode;
          break;
        case AddressChannel.Web:
          favoriteAddressInfo.favWeb = favoriteAddress.url;
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
    favEmail: DEFAULT_EMAIL,
    favPhone: DEFAULT_PHONE,
    favStreetName: DEFAULT_NAME,
    favStreetNumber: '',
    favZipCode: '',
    favCity: '',
    favCountryCode: '',
    favWeb: DEFAULT_URL,
  };
}
