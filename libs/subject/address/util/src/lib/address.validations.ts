import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { CITY_LENGTH, COUNTRY_LENGTH, EMAIL_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, NUMBER_LENGTH, PHONE_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AddressModel } from '@okr/shared-models';
import { baseValidations, booleanValidations, stringValidations, urlValidations } from '@okr/shared-util-core';
import { isPhoneNumberValid } from '@okr/shared-util-angular';

// Max zip length per country (address-only; does not touch the shared ZIP_LENGTH constant,
// which other forms still use as a Swiss 4-digit cap). Unknown countries -> permissive default.
const ZIP_MAX_LENGTH: Record<string, number> = { CH: 4, DE: 5, AT: 4, IT: 5, FR: 5, US: 10, GB: 8 };
const DEFAULT_ZIP_MAX_LENGTH = 10;

function zipMaxLength(countryCode: string): number {
  return ZIP_MAX_LENGTH[(countryCode ?? '').toUpperCase()] ?? DEFAULT_ZIP_MAX_LENGTH;
}

export const addressValidations = staticSuite((model: AddressModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('addressChannel', model.addressChannel);
  stringValidations('addressChannelLabel', model.addressChannelLabel, SHORT_NAME_LENGTH);
  stringValidations('addressUsage', model.addressUsage);
  stringValidations('addressUsageLabel', model.addressUsageLabel, SHORT_NAME_LENGTH);
  stringValidations('phone', model.phone, PHONE_LENGTH);
  stringValidations('email', model.email, EMAIL_LENGTH);
  stringValidations('streetName', model.streetName, NAME_LENGTH);
  stringValidations('streetNumber', model.streetNumber, NUMBER_LENGTH);
  stringValidations('addressValue2', model.addressValue2, SHORT_NAME_LENGTH);
  stringValidations('zipCode', model.zipCode, zipMaxLength(model.countryCode));
  stringValidations('city', model.city, CITY_LENGTH);
  stringValidations('countryCode', model.countryCode, COUNTRY_LENGTH);
  urlValidations('url', model.url);

  booleanValidations('isFavorite', model.isFavorite);
  booleanValidations('isCc', model.isCc);
  booleanValidations('isValidated', model.isValidated);

  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, LONG_NAME_LENGTH);
  stringValidations('parentKey', model.parentKey, NAME_LENGTH, 0, true);

  // cross validations
  omitWhen(model.addressChannel !== 'custom', () => {
    test('addressChannelLabel', '@address.customChannelLabelMandatory', () => {
      enforce(model.addressChannelLabel).isNotEmpty();
    })
  });
  omitWhen(model.addressUsage !== 'custom', () => {
    test('addressUsageLabel', '@address.customUsageLabelMandatory', () => {
      enforce(model.addressUsageLabel).isNotEmpty();
    })
  });

  // accept a valid number for any country (international '+' prefix or Swiss-local), only when present
  omitWhen(model.addressChannel !== 'phone' || !model.phone, () => {
    test('phone', '@address.invalidPhoneFormat', () => {
      enforce(isPhoneNumberValid(model.phone)).isTruthy();
    });
  });

  omitWhen(model.addressChannel !== 'postal', () => {
    test('zipCode', '@address.zipCodeMandatory', () => {
      enforce(model.zipCode).isNotEmpty();
    });
    test('city', '@address.cityMandatory', () => {
      enforce(model.city).isNotEmpty();
    });
    test('countryCode', '@address.countryMandatory', () => {
      enforce(model.countryCode).isNotEmpty();
    });
    test('countryCode', '@address.countryUppercase', () => {
      enforce(model.countryCode).equals(model.countryCode.toUpperCase());
    });
    test('countryCode', '@address.countryLength', () => {
      enforce(model.countryCode.length).equals(2);
    });
    omitWhen(model.countryCode !== 'CH', () => {
      test('zipCode', '@address.swissZipCodeNumeric', () => {
        enforce(model.zipCode).isNumeric();
      });
      test('zipCode', '@address.swissZipCodeLength', () => {
        enforce(model.zipCode.length).equals(4);
      })
    });
    omitWhen(model.countryCode !== 'DE', () => {
      test('zipCode', '@address.germanZipCodeNumeric', () => {
        enforce(model.zipCode).isNumeric();
      });
      test('zipCode', '@address.germanZipCodeLength', () => {
        enforce(model.zipCode.length).equals(5);
      });
    });
  });
});

// tbd: check that only one address is favorite per type (phone, email, postal)