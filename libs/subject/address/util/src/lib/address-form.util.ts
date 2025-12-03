import { AddressChannel, AddressModel, AddressUsage } from "@bk2/shared-models";
import { formatIban, IbanFormat } from "@bk2/shared-util-angular";
import { die, isType, replaceEndingSlash, replaceSubstring } from "@bk2/shared-util-core";

import { AddressFormModel } from "./address-form.model";
import { DEFAULT_CITY, DEFAULT_COUNTRY, DEFAULT_EMAIL, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_PHONE, DEFAULT_STREETNAME, DEFAULT_STREETNUMBER, DEFAULT_TAGS, DEFAULT_URL, DEFAULT_ZIP } from "@bk2/shared-constants";

export function convertAddressToForm(address?: AddressModel): AddressFormModel | undefined {
  if (!address) return undefined;
  return {
    bkey: address.bkey ?? DEFAULT_KEY,
    channelType: address.channelType ?? AddressChannel.Phone,
    channelLabel: address.channelLabel ?? DEFAULT_LABEL,
    usageType: address.usageType ?? AddressUsage.Home,
    usageLabel: address.usageLabel ?? DEFAULT_LABEL,
    phone: address.phone ?? DEFAULT_PHONE,
    email: address.email ?? DEFAULT_EMAIL,
    streetName: address.streetName ?? DEFAULT_STREETNAME,
    streetNumber: address.streetNumber ?? DEFAULT_STREETNUMBER,
    addressValue2: address.addressValue2 ?? DEFAULT_LABEL,
    zipCode: address.zipCode ?? DEFAULT_ZIP,
    city: address.city ?? DEFAULT_CITY,
    countryCode: address.countryCode ?? DEFAULT_COUNTRY,
    url: address.url ?? DEFAULT_URL,
    iban: address.channelType === AddressChannel.BankAccount ? formatIban(address.addressValue2, IbanFormat.Friendly) : '',
    isFavorite: address.isFavorite ?? false,
    isCc: address.isCc ?? false,
    isValidated: address.isValidated ?? false,
    tags: address.tags ?? DEFAULT_TAGS,
    parentKey: address.parentKey ?? DEFAULT_KEY,
    description: address.description ?? DEFAULT_LABEL
  }
}

export function convertFormToAddress(vm?: AddressFormModel, address?: AddressModel | undefined): AddressModel {
  if (!address) die('address-form.util.convertFormToAddress: address is mandatory.');
  if (!vm) return address;
  
  address.bkey = vm.bkey ?? DEFAULT_KEY;
  address.channelType = vm.channelType ?? AddressChannel.Phone;
  address.channelLabel = vm.channelLabel ?? DEFAULT_LABEL;
  address.usageType = vm.usageType ?? AddressUsage.Mobile;
  address.usageLabel = vm.usageLabel ?? DEFAULT_LABEL;
  address.phone = vm.phone ?? DEFAULT_PHONE;
  address.email = vm.email ?? DEFAULT_EMAIL;
  address.streetName = vm.streetName ?? DEFAULT_STREETNAME;
  address.streetNumber = vm.streetNumber ?? DEFAULT_STREETNUMBER;
  address.addressValue2 = vm.channelType === AddressChannel.BankAccount ? vm.iban ?? '' : vm.addressValue2 ?? '';
  address.zipCode = vm.zipCode ?? DEFAULT_ZIP;
  address.city = vm.city ?? DEFAULT_CITY;
  address.countryCode = vm.countryCode ?? DEFAULT_COUNTRY;
  address.url = vm.url ?? DEFAULT_URL;
  address.isFavorite = vm.isFavorite ?? false;
  address.isCc = vm.isCc ?? false;
  address.isValidated = vm.isValidated ?? false;
  address.tags = vm.tags ?? DEFAULT_TAGS;
  address.parentKey = vm.parentKey ?? DEFAULT_KEY;
  return address;
}

export function isAddress(address: unknown, tenantId: string): address is AddressModel {
  return isType(address, new AddressModel(tenantId));
}

export function getAddressValueByChannel(vm: AddressFormModel): string {
  if (vm.channelType === undefined) die('AddressUtil.getAddressValueByChannel: addressChannel is mandatory');

  // make some corrections of user input
  // street:  replace str. with strasse
  if (vm.streetName) {
    vm.streetName = replaceSubstring(vm.streetName ?? '', 'str.', 'strasse');
  }
  if (vm.url) {
    vm.url = replaceSubstring(vm.url, 'http://', '');
    vm.url = replaceSubstring(vm.url, 'https://', '');
    vm.url = replaceSubstring(vm.url, 'twitter.com/', '');
    vm.url = replaceSubstring(vm.url, 'www.xing.com/profile/', '');
    vm.url = replaceSubstring(vm.url, 'www.facebook.com/', '');
    vm.url = replaceSubstring(vm.url, 'www.linkedin.com/in/', '');
    vm.url = replaceSubstring(vm.url, 'www.instagram.com/', '');
    vm.url = replaceEndingSlash(vm.url);
  }
  if (vm.phone) {
    vm.phone = replaceSubstring(vm.phone, 'tel:', '');
  }
  if (vm.email) {
    vm.email = replaceSubstring(vm.email, 'mailto:', '');
  }
  switch (vm.channelType) {
    case AddressChannel.Phone: return vm.phone ?? '';
    case AddressChannel.Email: return vm.email ?? '';
    case AddressChannel.Postal: return vm.streetName ?? '' + vm.streetNumber ?? '';
    case AddressChannel.BankAccount: return formatIban(vm.iban ?? '', IbanFormat.Electronic);
    default: return vm.url ?? '';
  }
}


