import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CITY_LENGTH, COUNTRY_LENGTH, EMAIL_LENGTH, NUMBER_LENGTH, PHONE_LENGTH, SHORT_NAME_LENGTH, STREET_LENGTH, ZIP_LENGTH } from '@bk2/shared-constants';
import { AddressChannel, AddressUsage } from '@bk2/shared-models';
import { booleanValidations, categoryValidations, stringValidations, urlValidations } from '@bk2/shared-util-core';

import { AddressFormModel } from './address-form.model';
import { ibanValidations } from './iban.validations';

export const addressFormValidations = staticSuite((model: AddressFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  categoryValidations('channelType', model.channelType, AddressChannel);
  stringValidations('channelLabel', model.channelLabel, SHORT_NAME_LENGTH);
  categoryValidations('usageType', model.usageType, AddressUsage);
  stringValidations('usageLabel', model.usageLabel, SHORT_NAME_LENGTH);
  ibanValidations('iban', model.iban);
  urlValidations('url', model.url);

  omitWhen(model.channelType !== AddressChannel.Postal, () => {
    stringValidations('email', model.email, EMAIL_LENGTH);
    stringValidations('phone', model.phone, PHONE_LENGTH);
    stringValidations('streetName', model.streetName, STREET_LENGTH);
    stringValidations('streetNumber', model.streetNumber, NUMBER_LENGTH);
    stringValidations('addressValue2', model.addressValue2, SHORT_NAME_LENGTH);
    stringValidations('zipCode', model.zipCode, ZIP_LENGTH, ZIP_LENGTH);
    stringValidations('city', model.city, CITY_LENGTH);
    stringValidations('countryCode', model.countryCode, COUNTRY_LENGTH, COUNTRY_LENGTH);
  });

  booleanValidations('isFavorite', model.isFavorite);
  booleanValidations('isCc', model.isCc);
  booleanValidations('isValidated', model.isValidated);
  //tagValidations('tags', model.tags);
  stringValidations('parentKey', model.parentKey, SHORT_NAME_LENGTH, 0, true);
});


