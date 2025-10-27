import { AddressChannel, AddressModel, AddressUsage } from "@bk2/shared-models";
import { formatIban, IbanFormat } from "@bk2/shared-util-angular";
import { die, isType, replaceEndingSlash, replaceSubstring } from "@bk2/shared-util-core";

import { AddressFormModel } from "./address-form.model";

export function newAddressFormModel(): AddressFormModel {
  return {
    channelType: AddressChannel.Postal,
    channelLabel: '',
    usageType: AddressUsage.Home,
    usageLabel: '',
    phone: '',
    email: '',
    streetName: '',
    streetNumber: '',
    addressValue2: '',
    zipCode: '',
    city: '',
    countryCode: 'CH',
    url: '',
    iban: '',
    isFavorite: false,
    isCc: false,
    isValidated: false,
    tags: '',
    parentKey: ''
  }

}

export function convertAddressToForm(address: AddressModel | undefined): AddressFormModel {
  if (!address) return newAddressFormModel();
  console.log(address);
  return {
    bkey: address.bkey,
    channelType: address.channelType,
    channelLabel: address.channelLabel,
    usageType: address.usageType,
    usageLabel: address.usageLabel,
    phone: address.phone,
    email: address.email,
    streetName: address.streetName,
    streetNumber: address.streetNumber,
    addressValue2: address.addressValue2,
    zipCode: address.zipCode,
    city: address.city,
    countryCode: address.countryCode,
    url: address.url,
    iban: address.channelType === AddressChannel.BankAccount ? formatIban(address.addressValue2, IbanFormat.Friendly) : '',
    isFavorite: address.isFavorite,
    isCc: address.isCc,
    isValidated: address.isValidated,
    tags: address.tags,
    parentKey: address.parentKey
  }
}

export function convertFormToAddress(address: AddressModel | undefined, vm: AddressFormModel, tenantId: string): AddressModel {
  if (!address) address = new AddressModel(tenantId);
  address.bkey = vm.bkey ?? '';
  address.channelType = vm.channelType ?? AddressChannel.Phone;
  address.channelLabel = vm.channelLabel ?? '';
  address.usageType = vm.usageType ?? AddressUsage.Mobile;
  address.usageLabel = vm.usageLabel ?? '';
  address.phone = vm.phone ?? '';
  address.email = vm.email ?? '';
  address.streetName = vm.streetName ?? '';
  address.streetNumber = vm.streetNumber ?? '';
  address.addressValue2 = vm.channelType === AddressChannel.BankAccount ? vm.iban ?? '' : vm.addressValue2 ?? '';
  address.zipCode = vm.zipCode ?? '';
  address.city = vm.city ?? '';
  address.countryCode = vm.countryCode ?? '';
  address.url = vm.url ?? '';
  address.isFavorite = vm.isFavorite ?? false;
  address.isCc = vm.isCc ?? false;
  address.isValidated = vm.isValidated ?? false;
  address.tags = vm.tags ?? '';
  address.parentKey = vm.parentKey ?? '';
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


