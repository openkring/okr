import { AddressChannel, AddressCollection, AddressModel, AddressUsage, ModelType, OrgCollection, PersonCollection } from "@bk2/shared/models";
import { Browser } from "@capacitor/browser";
import { ToastController } from "@ionic/angular";
import { bkTranslate, copyToClipboard, getCountryName, showToast } from "@bk2/shared/i18n";
import { die, getModelAndKey } from "@bk2/shared/util";


/***************************  helpers *************************** */
export function getAddressModalTitle(addressKey: string | undefined): string {
  const _operation = !addressKey ? 'create' : 'update';
  return `@subject.address.operation.${_operation}.label`;
}

export function getStringifiedPostalAddress(address: AddressModel, lang: string): string | undefined {
    if (!address || address.channelType  !== AddressChannel.Postal) return undefined;
    const _countryName = getCountryName(address.countryCode, lang);
    return !_countryName ?
      `${address.addressValue}, ${address.zipCode} ${address.city}` :
      `${address.addressValue}, ${address.zipCode} ${address.city}, ${_countryName}`;
}

/**
 * Analyzes the given key and constructs a collection name:    PersonCollection|OrgCollection/parentkey/AddressCollection
 * @param parentKey  of format:  Modeltype.key
 * @returns the hierarchical collection name
 */
export function getAddressCollection(parentKey: string): string {
  if (parentKey?.length === 0) die('AddressService.read: uid is mandatory');
  if (parentKey.indexOf('.') === -1) die(`AddressService.read: invalid key ${parentKey} (expected Modeltype.key)`);
  const [_parentModelType, _parentKey] = getModelAndKey(parentKey);
  const _parentCollection = _parentModelType === ModelType.Org ? OrgCollection : PersonCollection;
  return `${_parentCollection}/${_parentKey}/${AddressCollection}`;
}

/**
 * Convenience method for migration and import. Creates an arbitrary address.
 */
export function createAddress(
    tenantId: string,
    usageType: AddressUsage,
    channelType: AddressChannel,
    value: string,
    isFavorite = false,
    isValidated = false,
    isCc = false,
    isArchived = false
): AddressModel {
    const _address = new AddressModel(tenantId);
    _address.usageType = usageType;
    _address.channelType = channelType;
    _address.addressValue = value;
    _address.isFavorite = isFavorite;
    _address.isCc = isCc;
    _address.isArchived = isArchived;
    _address.isValidated = isValidated;
    return _address;
}

/**
 * Create a favorite email address.
 * @param addressUsage the usage type of the email address (e.g. home, work)
 * @param addressValue the email address
 * @param tenantId the tenant ID
 * @returns the AddressModel of the email address
 */
export function createFavoriteEmailAddress(
    usageType: AddressUsage,
    value: string,
    tenantId: string): AddressModel {
    return createAddress(tenantId, usageType, AddressChannel.Email, value, true);
}

/**
 * Create a favorite phone address.
 * @param addressUsage the usage type of the phone number (e.g. home, work, mobile)
 * @param addressValue the phone number
 * @param tenantId the tenant ID
 * @returns the AddressModel of the phone number
 */
export function createFavoritePhoneAddress(
  addressUsage: AddressUsage,
  addressValue: string,
  tenantId: string): AddressModel {
    return createAddress(tenantId, addressUsage, AddressChannel.Phone, addressValue, true);
}

/**
 * Create a favorite web address (URL)
 * @param usageType the usage type of the web address (e.g. home, work)
 * @param addressValue the URL of the web address
 * @param tenantId the tenant ID
 * @returns the AddressModel of the web address
 */
export function createFavoriteWebAddress(
  usageType: AddressUsage,
  addressValue: string,
  tenantId: string): AddressModel {
    return createAddress(tenantId, usageType, AddressChannel.Web, addressValue, true);
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
export function createPostalAddress(
    tenantId: string,
    usageType: AddressUsage,
    street: string,
    addressValue2: string,
    zipCode: string,
    city: string,
    countryCode: string,
    isFavorite = false,
    isValidated = false,
    isCc = false,
    isArchived = false
): AddressModel {
    const _address = new AddressModel(tenantId);
    _address.usageType = usageType;
    _address.channelType = AddressChannel.Postal;
    _address.addressValue = street;
    _address.addressValue2 = addressValue2;
    _address.zipCode = zipCode;
    _address.city = city;
    _address.countryCode = countryCode;
    _address.isFavorite = isFavorite;
    _address.isCc = isCc;
    _address.isArchived = isArchived;
    _address.isValidated = isValidated;
    return _address;
}

/**
 * Create a favorite postal address.
 * @param addressUsage the usage type of the address (e.g. home, work, mobile)
 * @param street, the street name 
 * @param zipCode, a zip code, 8712 by default
 * @param city, a city name, Stäfa by default
 * @param countryCode a country code, CH by default
 * @param tenantId the tenant ID
 * @returns the address model of the favorite postal address
 */
export function createFavoritePostalAddress(usageType: AddressUsage, street: string, zipCode: string, city: string, countryCode: string, tenantId: string): AddressModel {
    return createPostalAddress(tenantId, usageType, street, '', zipCode, city, countryCode, true);
}

/**
 * Copy an address to the clipboard.
 * @param toastController used to show a confirmation message
 * @param address the address to copy
 */
export async function copyAddress(toastController: ToastController, toastLength: number, address: AddressModel, lang: string): Promise<void> {
  if (address.channelType === AddressChannel.Postal) {
    await copyToClipboard(getStringifiedPostalAddress(address, lang));
  } else {
    await copyToClipboard(address.addressValue);
  }
  await showToast(toastController, bkTranslate('@subject.address.operation.copy.conf'), toastLength);
}

/**
 * Browse to a URL.
 * @param url 
 * @param prefix a URL prefix that is defined by the channel type (e.g. https://twitter.com for type Twitter)
 */
export async function browseUrl(url: string, prefix: string): Promise<void> {
  return Browser.open({ url: prefix + url });
}

export function stringifyAddress(address: AddressModel): string {
  if (!address) return '';
  if (address.channelType === AddressChannel.Postal) {
  return `${address.addressValue}, ${address.zipCode} ${address.city}`;
  } else {
    return address.addressValue;
  }
}