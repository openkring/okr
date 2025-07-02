import { AddressChannel, AddressModel, AddressUsage } from "@bk2/shared/models";
import { AddressFormModel } from "./address-form.model";
import { die, isType, replaceEndingSlash, replaceSubstring } from "@bk2/shared/util-core";
import { formatIban, IbanFormat } from "@bk2/shared/util-angular";

export function newAddressFormModel(): AddressFormModel {
  return {
    channelType: AddressChannel.Postal,
    channelLabel: '',
    usageType: AddressUsage.Home,
    usageLabel: '',
    addressValue: '',
    phone: '',
    email: '',
    street: '',
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
    addressValue: address.addressValue,
    phone: address.channelType === AddressChannel.Phone ? address.addressValue : '',
    email: address.channelType === AddressChannel.Email ? address.addressValue : '',
    street: address.channelType === AddressChannel.Postal ? address.addressValue : '',
    addressValue2: address.addressValue2,
    zipCode: address.zipCode,
    city: address.city,
    countryCode: address.countryCode,
    url: address.url,
    iban: address.channelType === AddressChannel.BankAccount ? formatIban(address.addressValue, IbanFormat.Friendly) : '',
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
  address.addressValue = getAddressValueByChannel(vm);
  address.addressValue2 = vm.addressValue2 ?? '';
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
  if (vm.street) {
    vm.street = replaceSubstring(vm.street ?? '', 'str.', 'strasse');
  }
  if (vm.addressValue) {
    vm.addressValue = replaceSubstring(vm.addressValue, 'http://', '');
    vm.addressValue = replaceSubstring(vm.addressValue, 'https://', '');
    vm.addressValue = replaceSubstring(vm.addressValue, 'twitter.com/', '');
    vm.addressValue = replaceSubstring(vm.addressValue, 'www.xing.com/profile/', '');
    vm.addressValue = replaceSubstring(vm.addressValue, 'www.facebook.com/', '');
    vm.addressValue = replaceSubstring(vm.addressValue, 'www.linkedin.com/in/', '');
    vm.addressValue = replaceSubstring(vm.addressValue, 'www.instagram.com/', '');
    vm.addressValue = replaceEndingSlash(vm.addressValue);
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
    case AddressChannel.Postal: return vm.street ?? '';
    case AddressChannel.BankAccount: return formatIban(vm.iban ?? '', IbanFormat.Electronic);
    default: return vm.addressValue ?? '';
  }
}


