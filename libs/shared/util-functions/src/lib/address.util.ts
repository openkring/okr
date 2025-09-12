import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressChannel, AddressModel } from '@bk2/shared-models';
import { die, getCountryName } from '@bk2/shared-util-core';

export interface FavoriteAddressInfo {
  fav_email: string;
  fav_phone: string;
  fav_street: string;
  fav_zip: string;
  fav_city: string;
  fav_country: string;
  fav_web: string;
}

export async function updateFavoriteAddressInfo(firestore: Firestore, parentId: string, parentCollection: 'persons' | 'orgs', slug: 'person' | 'org'): Promise<void> {
  logger.info(`Address change for ${slug} ${parentId}`);
  const _ref = admin.firestore().doc(`${parentCollection}/${parentId}`);

  // with every address change, we update all favorite address info
  try {
    const favoriteAddressInfo = await getFavoriteAddressInfo(firestore, parentId, parentCollection);
    logger.info(`Updating favorite address info for ${slug} ${parentId}`, favoriteAddressInfo);
    await _ref.update({
      fav_email: favoriteAddressInfo.fav_email,
      fav_phone: favoriteAddressInfo.fav_phone,
      fav_street: favoriteAddressInfo.fav_street,
      fav_zip: favoriteAddressInfo.fav_zip,
      fav_city: favoriteAddressInfo.fav_city,
      fav_country: favoriteAddressInfo.fav_country,
    });
    logger.info(`Successfully updated favorite address info for ${slug} ${parentId}`);
  } catch (error) {
    logger.error(`Error updating ${slug} ${parentId}:`, error);
  }
}

export async function getFavoriteAddressInfo(firestore: Firestore, parentId: string, parentCollection: 'persons' | 'orgs'): Promise<FavoriteAddressInfo> {
  const _collection = `${parentCollection}/${parentId}/addresses`;
  let _query: FirebaseFirestore.Query = firestore.collection(_collection);
  _query = _query.where('isFavorite', '==', true);
  const _favAddressInfo = getEmptyFavoriteAddressInfo();
  const _snapshot = await _query.get();
  if (_snapshot.empty) {
    logger.info(`getFavoriteAddressInfo: no favorite addresses found for ${parentCollection}/${parentId})`);
  } else {
    const _favs = _snapshot.docs.map(doc => {
      return { ...doc.data(), bkey: doc.id } as AddressModel;
    });
    logger.info(`getFavoriteAddressInfo: found ${_favs.length} favorite addresses for ${parentCollection}/${parentId}`);
    for (const _fav of _favs) {
      switch (_fav.channelType) {
        case AddressChannel.Email:
          _favAddressInfo.fav_email = _fav.addressValue;
          break;
        case AddressChannel.Phone:
          _favAddressInfo.fav_phone = _fav.addressValue;
          break;
        case AddressChannel.Postal:
          _favAddressInfo.fav_street = _fav.addressValue;
          _favAddressInfo.fav_zip = _fav.zipCode;
          _favAddressInfo.fav_city = _fav.city;
          _favAddressInfo.fav_country = getCountryName(_fav.countryCode, 'en');
          break;
        case AddressChannel.Web:
          _favAddressInfo.fav_web = _fav.url;
          break;
        default:
          die(`AddressUtil.getEmptyFavoriteAddressInfo: unknown channel type ${_fav.channelType}`);
      }
    }
  }
  return _favAddressInfo;
}

function getEmptyFavoriteAddressInfo(): FavoriteAddressInfo {
  return {
    fav_email: '',
    fav_phone: '',
    fav_street: '',
    fav_zip: '',
    fav_city: '',
    fav_country: '',
    fav_web: '',
  };
}
