import { AddressChannel, AddressUsage } from '@bk2/shared-models';

export type AddressFormModel = {
  bkey: string,
  channelType: AddressChannel,
  channelLabel: string,
  usageType: AddressUsage,
  usageLabel: string,
  phone: string,
  email: string,
  streetName: string,
  streetNumber: string,
  addressValue2: string,
  zipCode: string,
  city: string,
  countryCode: string,
  iban: string,
  url: string,

  isFavorite: boolean,
  isCc: boolean,
  isValidated: boolean,
  tags: string,
  description: string,
  parentKey: string
};

export const ADDRESS_FORM_SHAPE: AddressFormModel = {
  bkey: '',
  channelType: AddressChannel.Phone,
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
  countryCode: '',
  iban: '',
  url: '',
  isFavorite: false,
  isCc: false,
  isValidated: false,
  tags: '',
  description: '',
  parentKey: ''
};