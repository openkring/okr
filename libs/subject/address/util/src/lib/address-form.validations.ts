import { enforce, omitWhen, only, staticSuite, test} from 'vest';

import { ibanValidations } from './iban.validations';
import { AddressFormModel } from './address-form.model';
import { booleanValidations, categoryValidations, stringValidations, urlValidations } from '@bk2/shared/util-core';
import { CITY_LENGTH, COUNTRY_LENGTH, SHORT_NAME_LENGTH, STREET_LENGTH, ZIP_LENGTH } from '@bk2/shared/constants';
import { AddressChannel, AddressUsage } from '@bk2/shared/models';

export const addressFormValidations = staticSuite((model: AddressFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  categoryValidations('channelType', model.channelType, AddressChannel);
  stringValidations('channelLabel', model.channelLabel, SHORT_NAME_LENGTH);
  categoryValidations('usageType', model.usageType, AddressUsage);
  stringValidations('usageLabel', model.usageLabel, SHORT_NAME_LENGTH);
  stringValidations('addressValue', model.addressValue, SHORT_NAME_LENGTH);
  ibanValidations('iban', model.iban);
  urlValidations('url', model.url);

  omitWhen(model.channelType === AddressChannel.Postal, () => {
    test('addressValue', 'addressValueMandatoryForNonPostal', () => {
      enforce(model.addressValue).isNotBlank();
    })
  });
  omitWhen(model.channelType !== AddressChannel.Postal, () => {
    stringValidations('addressValue2', model.addressValue2, SHORT_NAME_LENGTH);
    stringValidations('street', model.street, STREET_LENGTH);
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


