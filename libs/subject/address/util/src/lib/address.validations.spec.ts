import '@angular/compiler';
import { describe, it, expect } from 'vitest';

import { AddressModel } from '@bk2/shared-models';
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
