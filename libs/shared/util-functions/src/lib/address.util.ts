import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressChannel, AddressCollection, AddressModel, OrgCollection, PersonCollection } from '@bk2/shared-models';
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
 * @param addressId the key to the address data
 */
export async function updateFavoriteAddressInfo(firestore: Firestore, address: AddressModel, addressId: string): Promise<void> {
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
    const favoriteAddressInfo = await getFavoriteAddressInfo(firestore, address.parentKey);
    logger.info(`Updating favorite address info for ${parentCollection}/${parentId}`, favoriteAddressInfo);
    const ref = admin.firestore().doc(`${parentCollection}/${parentId}`);
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
 * @param parentKey  the key to the parent document of the address (e.g. person.{bkey} or org.{bkey})
 * @returns FavoriteAddressInfo, i.e. the data that is cached in teh parent document.
 */
async function getFavoriteAddressInfo(firestore: Firestore, parentKey: string): Promise<FavoriteAddressInfo> {
  let query: FirebaseFirestore.Query = firestore.collection(AddressCollection);
  query = query.where('parentKey', '==', parentKey);
  const favoriteAddressInfo = getEmptyFavoriteAddressInfo();
  const snapshot = await query.get();
  if (snapshot.empty) {
    logger.info(`getFavoriteAddressInfo: no favorite addresses found for ${parentKey})`);
  } else {
    const favoriteAddresses = snapshot.docs.map(doc => {
      return { ...doc.data(), bkey: doc.id } as AddressModel;
    });
    logger.info(`getFavoriteAddressInfo: found ${favoriteAddresses.length} favorite addresses for ${parentKey}`);
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
