import { Firestore } from 'firebase-admin/firestore';
import { die, getCountryName } from "@bk2/shared/util-core";
import { AddressChannel, AddressModel } from '@bk2/shared/models';
import { searchData } from './search.util';

export interface FavoriteAddressInfo {
  fav_email: string,
  fav_phone: string,
  fav_street: string,
  fav_zip: string,
  fav_city: string,
  fav_country: string,
  fav_web: string,
}

export async function getFavoriteAddressInfo(firestore: Firestore, parentId: string, parentCollection: 'persons' | 'orgs'): Promise<FavoriteAddressInfo> {
  const _collection = `${parentCollection}/${parentId}/addresses`;
  const _query = [{ key: 'isFavorite', operator: '==', value: true }];
  const _favs = await searchData<AddressModel>(firestore, _collection, _query);
  const _favAddressInfo = getEmptyFavoriteAddressInfo();
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
  return _favAddressInfo; 
}

function getEmptyFavoriteAddressInfo(): FavoriteAddressInfo {
  return {
    'fav_email': '',
    'fav_phone': '',
    'fav_street': '',
    'fav_zip': '',
    'fav_city': '',
    'fav_country': '',
    'fav_web': '',
  };
}