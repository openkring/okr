import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CITY_LENGTH, COUNTRY_LENGTH, EMAIL_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, NUMBER_LENGTH, PHONE_LENGTH, SHORT_NAME_LENGTH, ZIP_LENGTH } from '@bk2/shared-constants';
import { AddressChannel, AddressModel, AddressUsage } from '@bk2/shared-models';
import { baseValidations, booleanValidations, categoryValidations, stringValidations, urlValidations } from '@bk2/shared-util-core';

export const addressValidations = staticSuite((model: AddressModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  categoryValidations('channelType', model.channelType, AddressChannel);
  stringValidations('channelLabel', model.channelLabel, SHORT_NAME_LENGTH);
  categoryValidations('usageType', model.usageType, AddressUsage);
  stringValidations('usageLabel', model.usageLabel, SHORT_NAME_LENGTH);
  stringValidations('phone', model.phone, PHONE_LENGTH);
  stringValidations('email', model.email, EMAIL_LENGTH);
  stringValidations('streetName', model.streetName, NAME_LENGTH);
  stringValidations('streetNumber', model.streetNumber, NUMBER_LENGTH);
  stringValidations('addressValue2', model.addressValue2, SHORT_NAME_LENGTH);
  stringValidations('zipCode', model.zipCode, ZIP_LENGTH);
  stringValidations('city', model.city, CITY_LENGTH);
  stringValidations('countryCode', model.countryCode, COUNTRY_LENGTH);
  urlValidations('url', model.url);

  booleanValidations('isFavorite', model.isFavorite);
  booleanValidations('isCc', model.isCc);
  booleanValidations('isValidated', model.isValidated);

  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, LONG_NAME_LENGTH);
  stringValidations('parentKey', model.parentKey, SHORT_NAME_LENGTH, 0, true);

  // cross validations
  omitWhen(model.channelType !== AddressChannel.Custom, () => {
    test('addressChannelLabel', 'addressCustomChannelLabelMandatory', () => {
      enforce(model.channelLabel).isNotEmpty();
    })
  });
  omitWhen(model.usageType !== AddressUsage.Custom, () => {
    test('usageLabel', 'addressCustomUsageLabelMandatory', () => {
      enforce(model.usageLabel).isNotEmpty();
    })
  });

  omitWhen(model.channelType !== AddressChannel.Postal, () => {
    test('zipCode', 'addressZipCodeMandatory', () => {
      enforce(model.zipCode).isNotEmpty();
    });
    test('city', 'addressCityMandatory', () => {
      enforce(model.city).isNotEmpty();
    });
    test('countryCode', 'addressCountryMandatory', () => {
      enforce(model.countryCode).isNotEmpty();
    });
    test('countryCode', 'addressCountryUppercase', () => {
      enforce(model.countryCode).equals(model.countryCode.toUpperCase());
    });
    test('countryCode', 'addressCountryLength', () => {
      enforce(model.countryCode.length).equals(2);
    });
    omitWhen(model.countryCode !== 'CH', () => {
      test('zipCode', 'addressSwissZipCodeNumeric', () => {
        enforce(model.zipCode).isNumeric();
      });
      test('zipCode', 'addressSwissZipCodeLength', () => {
        enforce(model.zipCode.length).equals(4);
      })
    });
  });
});

// tbd: check that only one address is favorite per type (phone, email, postal)