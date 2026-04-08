import { Browser } from '@capacitor/browser';
import { ToastController } from '@ionic/angular';

import { bkTranslate } from '@bk2/shared-i18n';
import { AddressModel } from '@bk2/shared-models';
import { copyToClipboard, formatIban, IbanFormat, showToast } from '@bk2/shared-util-angular';
import { die, getCountryName, isType, replaceEndingSlash, replaceSubstring } from '@bk2/shared-util-core';

/*-------------------------- address creation --------------------------------*/

/**
 * Generic function to create a favorite address of type email, phone, web, or postal
 * @param channel 
 * @param usage 
 * @param value 
 * @param tenantId 
 * @param streetNumber optional, only needed for postal
 * @param addressValue2  optional, only needed by postal
 * @param zipCode  optional, only needed for postal
 * @param city  optional, only needed for postal
 * @param countryCode  optional, only needed for postal
 * @returns 
 */
export function createFavoriteAddress(channel: string, usage: string, value: string, tenantId: string, streetNumber?: string, addressValue2?: string, zipCode?: string, city?: string, countryCode?: string): AddressModel {
  const address = new AddressModel(tenantId);
  address.addressUsage = usage;
  address.addressChannel = channel;
  address.isFavorite = true;
  address.isCc = false;
  address.isArchived = false;
  address.isValidated = false;
  return saveAddressValue(address, value, streetNumber, addressValue2, zipCode, city, countryCode)
}


export function saveAddressValue(address: AddressModel, value: string, streetNumber?: string, addressValue2?: string, zipCode?: string, city?: string, countryCode?: string): AddressModel {
  switch (address.addressChannel) {
    case 'email': address.email = value; break;
    case 'phone': address.phone = value; break;
    case 'web': address.url = value; break;
    case 'postal': 
      address.streetName = value;
      address.streetNumber = streetNumber ?? '';
      address.addressValue2 = addressValue2 ?? '';
      address.zipCode = zipCode ?? '';
      address.city = city ?? '';
      address.countryCode = countryCode ?? 'CH';
      break;
  }
  return address;
}

/**
 * Create a favorite email address.
 * @param usage the usage of the email address (e.g. home, work)
 * @param email the email address
 * @param tenantId the tenant ID
 * @returns the AddressModel of the email address
 */
export function createFavoriteEmailAddress(usage: string, email: string, tenantId: string): AddressModel {
  return createFavoriteAddress('email', usage, email, tenantId);
}

/**
 * Create a favorite phone address.
 * @param addressUsage the usage of the phone number (e.g. home, work, mobile)
 * @param phone the phone number
 * @param tenantId the tenant ID
 * @returns the AddressModel of the phone number
 */
export function createFavoritePhoneAddress(usage: string, phone: string, tenantId: string): AddressModel {
  return createFavoriteAddress('phone', usage, phone, tenantId);
}

/**
 * Create a favorite web address (URL)
 * @param addressUsage the usage of the web address (e.g. home, work)
 * @param url the URL of the web address
 * @param tenantId the tenant ID
 * @returns the AddressModel of the web address
 */
export function createFavoriteWebAddress(usage: string, url: string, tenantId: string): AddressModel {
  return createFavoriteAddress('web', usage, url, tenantId);
}

/**
 * Create a postal address.
 * @param addressUsage
 * @param street
 * @param addressValue2
 * @param zipCode
 * @param city
 * @param countryCode
 * @param isFavorite
 * @param isValidated
 * @param isCc
 * @param isTest
 * @param isArchived
 * @returns the AddressModel of the postal address
 */
export function createPostalAddress(tenantId: string, usage: string, streetName: string, streetNumber: string, addressValue2: string, zipCode: string, city: string, countryCode: string, isFavorite = false, isValidated = false, isCc = false, isArchived = false): AddressModel {
  const address = createFavoriteAddress('postal', usage, streetName, tenantId, streetNumber, addressValue2, zipCode, city, countryCode);
  address.isFavorite = isFavorite;
  address.isCc = isCc;
  address.isArchived = isArchived;
  address.isValidated = isValidated;
  return address;
}

/**
 * Create a favorite postal address.
 * @param addressUsage the usage of the address (e.g. home, work, mobile)
 * @param streetName, the street name
 * @param streetNumber, the street number
 * @param zipCode, a zip code
 * @param city, a city name
 * @param countryCode a country code, CH by default
 * @param tenantId the tenant ID
 * @returns the address model of the favorite postal address
 */
export function createFavoritePostalAddress(addressUsage: string, streetName: string, streetNumber: string, zipCode: string, city: string, countryCode: string, tenantId: string): AddressModel {
  return createPostalAddress(tenantId, addressUsage, streetName, streetNumber, '', zipCode, city, countryCode, true);
}

/*-------------------------- typing and retrieval of address values --------------------------------*/
export function isAddress(address: unknown, tenantId: string): address is AddressModel {
  return isType(address, new AddressModel(tenantId));
}

export function getAddressValueByChannel(address: AddressModel): string {
  if (address.addressChannel === undefined) die('AddressUtil.getAddressValueByChannel: addressChannel is mandatory');

  // make some corrections of user input
  // street:  replace str. with strasse
  if (address.streetName) {
    address.streetName = replaceSubstring(address.streetName ?? '', 'str.', 'strasse');
  }
  if (address.url) {
    // strip social media prefixes so only the handle/path is stored (prefix re-added at browse time)
    address.url = replaceSubstring(address.url, 'twitter.com/', '');
    address.url = replaceSubstring(address.url, 'www.xing.com/profile/', '');
    address.url = replaceSubstring(address.url, 'www.facebook.com/', '');
    address.url = replaceSubstring(address.url, 'www.linkedin.com/in/', '');
    address.url = replaceSubstring(address.url, 'www.instagram.com/', '');
    address.url = replaceEndingSlash(address.url);
    // Note: https:// is NOT stripped — web channel URLs are stored with the full protocol
  }
  if (address.phone) {
    address.phone = replaceSubstring(address.phone, 'tel:', '');
  }
  if (address.email) {
    address.email = replaceSubstring(address.email, 'mailto:', '');
  }
  switch (address.addressChannel) {
    case 'phone': return address.phone ?? '';
    case 'email': return address.email ?? '';
    case 'postal': return address.streetName ?? '' + address.streetNumber ?? '';
    case 'bankaccount': return formatIban(address.iban ?? '', IbanFormat.Electronic);
    default: return address.url ?? '';
  }
}

export function stringifyAddress(address: AddressModel, lang = 'de'): string {
  if (!address) return '';
  switch (address.addressChannel) {
    case 'email': 
      return address.email;
    case 'phone': 
      return address.phone;
    case 'postal': 
      return stringifyPostalAddress(address, lang);
    case 'bankaccount':
      return formatIban(address.iban, IbanFormat.Friendly);
    case 'twint':
      return '';
    default: 
      return address.url;
  }
}

export function stringifyPostalAddress(address: AddressModel, lang: string): string {
  if (!address || address.addressChannel !== 'postal') return '';
  const countryName = getCountryName(address.countryCode, lang);
  return !countryName ? `${address.streetName} ${address.streetNumber}, ${address.zipCode} ${address.city}` : `${address.streetName} ${address.streetNumber}, ${address.zipCode} ${address.city}, ${countryName}`;
}

/*-------------------------- action helpers --------------------------------*/

/**
 * Browse to a URL.
 * @param url
 * @param prefix a URL prefix that is defined by the channel type (e.g. https://twitter.com for type Twitter)
 */
export async function browseUrl(url: string, prefix = ''): Promise<void> {
  const fullUrl = prefix + url;
  
  try {
    await Browser.open({ url: fullUrl });
  } catch (err) {
    // Fallback for web or when Browser.open fails
    if (typeof window !== 'undefined') {
      window.open(fullUrl, '_blank');
    } else {
      throw err;
    }
  }
}

/**
 * Copy an address to the clipboard.
 * @param toastController used to show a confirmation message
 * @param address the address to copy
 */
export async function copyAddress(toastController: ToastController, address: AddressModel, lang: string): Promise<void> {
  await copyToClipboard(stringifyAddress(address, lang));
  await showToast(toastController, bkTranslate('@subject.address.operation.copy.conf'));
}

/*-------------------------- favorite address cache --------------------------------*/
/**
 * Derive the cached fav* address values from a list of addresses (client-side equivalent
 * of the Cloud Function getFavoriteAddressInfo).
 * Only favorite addresses are considered; for each channel the last favorite wins.
 */
export function computeFavoriteAddressInfo(addresses: AddressModel[]): {
  favEmail: string;
  favPhone: string;
  favStreetName: string;
  favStreetNumber: string;
  favZipCode: string;
  favCity: string;
  favCountryCode: string;
} {
  const info = {
    favEmail: '', favPhone: '',
    favStreetName: '', favStreetNumber: '',
    favZipCode: '', favCity: '', favCountryCode: '',
  };
  for (const a of addresses.filter(a => a.isFavorite)) {
    switch (a.addressChannel) {
      case 'email':  info.favEmail = a.email ?? ''; break;
      case 'phone':  info.favPhone = a.phone ?? ''; break;
      case 'postal':
        info.favStreetName   = a.streetName ?? '';
        info.favStreetNumber = a.streetNumber ?? '';
        info.favZipCode      = a.zipCode ?? '';
        info.favCity         = a.city ?? '';
        info.favCountryCode  = a.countryCode ?? '';
        break;
    }
  }
  return info;
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given address based on its values.
 * @param address the address for which to create the index
 * @returns the index string
 */
export function getAddressIndex(address: AddressModel): string {
  switch (address.addressChannel) {
    case 'phone': 
      return `n:${address.phone.replace(/\s/g, '')}`;
    case 'email': 
      return `n:${address.email}`;
    case 'postal': 
      return `n:${address.streetName}${address.streetNumber}${address.countryCode}${address.zipCode}${address.city}`;
    case 'bankaccount':
      return `n:${formatIban(address.iban ?? '', IbanFormat.Electronic)}`;
    default:
      return `n:${address.url}`;
  }
}

export function getAddressIndexInfo(): string {
  return 'n:addressValue';
}



