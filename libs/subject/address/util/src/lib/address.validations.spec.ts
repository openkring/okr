import '@angular/compiler';
import { describe, it, expect } from 'vitest';

import { AddressModel } from '@okr/shared-models';
import { addressValidations } from './address.validations';

const tenantId = 'tenant-1';

function phoneAddress(phone: string): AddressModel {
  const address = new AddressModel(tenantId);
  address.addressChannel = 'phone';
  address.addressUsage = 'mobile';
  address.phone = phone;
  return address;
}

describe('addressValidations — phone format', () => {
  it('accepts a Swiss-local number', () => {
    expect(addressValidations(phoneAddress('0791231234'), tenantId, '').hasErrors('phone')).toBe(false);
  });

  it('accepts an international (German) number with a + prefix', () => {
    expect(addressValidations(phoneAddress('+4915123456789'), tenantId, '').hasErrors('phone')).toBe(false);
  });

  it('rejects an unparseable number', () => {
    expect(addressValidations(phoneAddress('not-a-number'), tenantId, '').hasErrors('phone')).toBe(true);
  });

  it('does not flag an empty phone (optional field)', () => {
    expect(addressValidations(phoneAddress(''), tenantId, '').hasErrors('phone')).toBe(false);
  });

  it('does not run the phone-format rule for non-phone channels', () => {
    const address = new AddressModel(tenantId);
    address.addressChannel = 'email';
    address.email = 'test@example.com';
    expect(addressValidations(address, tenantId, '').hasErrors('phone')).toBe(false);
  });
});

function postalAddress(countryCode: string, zipCode: string): AddressModel {
  const address = new AddressModel(tenantId);
  address.addressChannel = 'postal';
  address.addressUsage = 'home';
  address.streetName = 'Teststrasse';
  address.streetNumber = '1';
  address.city = 'Teststadt';
  address.countryCode = countryCode;
  address.zipCode = zipCode;
  return address;
}

describe('addressValidations — country zip rules', () => {
  it('accepts a 4-digit CH zip', () => {
    expect(addressValidations(postalAddress('CH', '8001'), tenantId, '').hasErrors('zipCode')).toBe(false);
  });

  it('accepts a 5-digit DE zip', () => {
    expect(addressValidations(postalAddress('DE', '10115'), tenantId, '').hasErrors('zipCode')).toBe(false);
  });

  it('rejects a 4-digit DE zip', () => {
    expect(addressValidations(postalAddress('DE', '1011'), tenantId, '').hasErrors('zipCode')).toBe(true);
  });

  it('rejects a non-numeric DE zip', () => {
    expect(addressValidations(postalAddress('DE', 'ABCDE'), tenantId, '').hasErrors('zipCode')).toBe(true);
  });

  it('accepts an alphanumeric GB postcode (permissive country)', () => {
    expect(addressValidations(postalAddress('GB', 'SW1A 1AA'), tenantId, '').hasErrors('zipCode')).toBe(false);
  });

  it('accepts a 5-digit FR zip (permissive country)', () => {
    expect(addressValidations(postalAddress('FR', '75001'), tenantId, '').hasErrors('zipCode')).toBe(false);
  });
});
