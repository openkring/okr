import { describe, expect, it } from 'vitest';
import { AddressCollection, AddressModel, AddressModelName } from './address.model';

describe('AddressModel', () => {
  it('should create an instance with tenantId', () => {
    const model = new AddressModel('tenant-123');
    expect(model).toBeInstanceOf(AddressModel);
    expect(model.tenants).toEqual(['tenant-123']);
  });

  it('has empty defaults for the sensitive scalar channels (spec 1.19)', () => {
    const model = new AddressModel('tenant-xyz');
    expect(model.ssn).toBe('');
    expect(model.dob).toBe('');
    expect(model.iban).toBe('');
  });

  it('exports collection and model name', () => {
    expect(AddressCollection).toBe('addresses');
    expect(AddressModelName).toBe('address');
  });
});
