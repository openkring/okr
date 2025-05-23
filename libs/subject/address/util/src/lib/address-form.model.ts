import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { AddressChannel, AddressUsage } from '@bk2/shared/models';

export type AddressFormModel = DeepPartial<{
  bkey: string,
  channelType: AddressChannel,
  channelLabel: string,
  usageType: AddressUsage,
  usageLabel: string,
  addressValue: string,
  addressValue2: string,
  phone: string,
  email: string,
  street: string,
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
}>;

export const addressFormModelShape: DeepRequired<AddressFormModel> = {
  bkey: '',
  channelType: AddressChannel.Phone,
  channelLabel: '',
  usageType: AddressUsage.Home,
  usageLabel: '',
  addressValue: '',
  addressValue2: '',
  phone: '',
  email: '',
  street: '',
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