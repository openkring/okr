import { Browser } from '@capacitor/browser';
import { ToastController } from '@ionic/angular';

import { bkTranslate } from '@bk2/shared-i18n';
import { AddressChannel, AddressModel, AddressUsage } from '@bk2/shared-models';
import { copyToClipboard, formatIban, IbanFormat, showToast } from '@bk2/shared-util-angular';
import { die, getCountryName, isType, replaceEndingSlash, replaceSubstring } from '@bk2/shared-util-core';

/*-------------------------- address creation --------------------------------*/

/**
 * Create a favorite email address.
 * @param addressUsage the usage type of the email address (e.g. home, work)
 * @param email the email address
 * @param tenantId the tenant ID
 * @returns the AddressModel of the email address
 */
export function createFavoriteEmailAddress(addressUsage: AddressUsage, email: string, tenantId: string): AddressModel {
  const address = new AddressModel(tenantId);
  address.usageType = addressUsage;
  address.channelType = AddressChannel.Email;
  address.email = email;
  address.isFavorite = true;
  address.isCc = false;
  address.isArchived = false;
  address.isValidated = false;
  return address;
}

/**
 * Create a favorite phone address.
 * @param addressUsage the usage type of the phone number (e.g. home, work, mobile)
 * @param phone the phone number
 * @param tenantId the tenant ID
 * @returns the AddressModel of the phone number
 */
export function createFavoritePhoneAddress(addressUsage: AddressUsage, phone: string, tenantId: string): AddressModel {
  const address = new AddressModel(tenantId);
  address.usageType = addressUsage;
  address.channelType = AddressChannel.Phone;
  address.phone = phone;
  address.isFavorite = true;
  address.isCc = false;
  address.isArchived = false;
  address.isValidated = false;
  return address;
}

/**
 * Create a favorite web address (URL)
 * @param usageType the usage type of the web address (e.g. home, work)
 * @param url the URL of the web address
 * @param tenantId the tenant ID
 * @returns the AddressModel of the web address
 */
export function createFavoriteWebAddress(usageType: AddressUsage, url: string, tenantId: string): AddressModel {
  const address = new AddressModel(tenantId);
  address.usageType = usageType;
  address.channelType = AddressChannel.Web;
  address.url = url;
  address.isFavorite = true;
  address.isCc = false;
  address.isArchived = false;
  address.isValidated = false;
  return address;
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
export function createPostalAddress(tenantId: string, usageType: AddressUsage, streetName: string, streetNumber: string, addressValue2: string, zipCode: string, city: string, countryCode: string, isFavorite = false, isValidated = false, isCc = false, isArchived = false): AddressModel {
  const address = new AddressModel(tenantId);
  address.usageType = usageType;
  address.channelType = AddressChannel.Postal;
  address.streetName = streetName;
  address.streetNumber = streetNumber;
  address.addressValue2 = addressValue2;
  address.zipCode = zipCode;
  address.city = city;
  address.countryCode = countryCode;
  address.isFavorite = isFavorite;
  address.isCc = isCc;
  address.isArchived = isArchived;
  address.isValidated = isValidated;
  return address;
}

/**
 * Create a favorite postal address.
 * @param addressUsage the usage type of the address (e.g. home, work, mobile)
 * @param streetName, the street name
 * @param streetNumber, the street number
 * @param zipCode, a zip code
 * @param city, a city name
 * @param countryCode a country code, CH by default
 * @param tenantId the tenant ID
 * @returns the address model of the favorite postal address
 */
export function createFavoritePostalAddress(usageType: AddressUsage, streetName: string, streetNumber: string, zipCode: string, city: string, countryCode: string, tenantId: string): AddressModel {
  return createPostalAddress(tenantId, usageType, streetName, streetNumber, '', zipCode, city, countryCode, true);
}

/*-------------------------- typing and retrieval of address values --------------------------------*/
export function isAddress(address: unknown, tenantId: string): address is AddressModel {
  return isType(address, new AddressModel(tenantId));
}

export function getAddressValueByChannel(address: AddressModel): string {
  if (address.channelType === undefined) die('AddressUtil.getAddressValueByChannel: addressChannel is mandatory');

  // make some corrections of user input
  // street:  replace str. with strasse
  if (address.streetName) {
    address.streetName = replaceSubstring(address.streetName ?? '', 'str.', 'strasse');
  }
  if (address.url) {
    address.url = replaceSubstring(address.url, 'http://', '');
    address.url = replaceSubstring(address.url, 'https://', '');
    address.url = replaceSubstring(address.url, 'twitter.com/', '');
    address.url = replaceSubstring(address.url, 'www.xing.com/profile/', '');
    address.url = replaceSubstring(address.url, 'www.facebook.com/', '');
    address.url = replaceSubstring(address.url, 'www.linkedin.com/in/', '');
    address.url = replaceSubstring(address.url, 'www.instagram.com/', '');
    address.url = replaceEndingSlash(address.url);
  }
  if (address.phone) {
    address.phone = replaceSubstring(address.phone, 'tel:', '');
  }
  if (address.email) {
    address.email = replaceSubstring(address.email, 'mailto:', '');
  }
  switch (address.channelType) {
    case AddressChannel.Phone: return address.phone ?? '';
    case AddressChannel.Email: return address.email ?? '';
    case AddressChannel.Postal: return address.streetName ?? '' + address.streetNumber ?? '';
    case AddressChannel.BankAccount: return formatIban(address.iban ?? '', IbanFormat.Electronic);
    default: return address.url ?? '';
  }
}

export function stringifyAddress(address: AddressModel, lang = 'de'): string {
  if (!address) return '';
  switch (address.channelType) {
    case AddressChannel.Email: 
      return address.email;
    case AddressChannel.Phone: 
      return address.phone;
    case AddressChannel.Postal: 
      return stringifyPostalAddress(address, lang);
    case AddressChannel.BankAccount:
      return formatIban(address.iban, IbanFormat.Friendly)
    default: 
      return address.url;
  }
}

export function stringifyPostalAddress(address: AddressModel, lang: string): string {
  if (!address || address.channelType !== AddressChannel.Postal) return '';
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

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given address based on its values.
 * @param address the address for which to create the index
 * @returns the index string
 */
export function getAddressIndex(address: AddressModel): string {
  switch (address.channelType) {
    case AddressChannel.Phone: 
      return `n:${address.phone.replace(/\s/g, '')}`;
    case AddressChannel.Email: 
      return `n:${address.email}`;
    case AddressChannel.Postal: 
      return `n:${address.streetName}${address.streetNumber}${address.countryCode}${address.zipCode}${address.city}`;
    case AddressChannel.BankAccount:
      return `n:${formatIban(address.iban ?? '', IbanFormat.Electronic)}`;
    default:
      return `n:${address.url}`;
  }
}

export function getAddressIndexInfo(): string {
  return 'n:addressValue';
}



