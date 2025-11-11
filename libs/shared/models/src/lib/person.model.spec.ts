import { describe, expect, it } from 'vitest';
import { PersonCollection, PersonModel } from './person.model';
import { DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS } from '@bk2/shared-constants';
describe('PersonModel', () => {
  it('should create an instance with tenantId', () => {
    const model = new PersonModel('tenant-123');
    expect(model).toBeInstanceOf(PersonModel);
    expect(model.tenants).toEqual(['tenant-123']);
  });

  it('should have default property values', () => {
    const model = new PersonModel('tenant-xyz');
    expect(model.bkey).toBe(DEFAULT_KEY);
    expect(model.isArchived).toBe(false);
    expect(model.index).toBe(DEFAULT_INDEX);
    expect(model.tags).toBe(DEFAULT_TAGS);
    expect(model.notes).toBe(DEFAULT_NOTES);
    expect(model.firstName).toBe(DEFAULT_NAME);
    expect(model.lastName).toBe(DEFAULT_NAME);
    expect(model.gender).toBe(DEFAULT_GENDER);
    expect(model.ssnId).toBe(DEFAULT_ID);
    expect(model.dateOfBirth).toBe(DEFAULT_DATE);
    expect(model.dateOfDeath).toBe(DEFAULT_DATE);
    expect(model.favEmail).toBe(DEFAULT_EMAIL);
    expect(model.favPhone).toBe(DEFAULT_PHONE);
    expect(model.favStreetName).toBe(DEFAULT_NAME);
    expect(model.favStreetNumber).toBe('');
    expect(model.favZipCode).toBe('');
    expect(model.favCity).toBe('');
    expect(model.favCountryCode).toBe('');
    expect(model.bexioId).toBe(DEFAULT_ID);
  });

  it('should set tenants array with constructor argument', () => {
    const model = new PersonModel('tenant-abc');
    expect(model.tenants).toEqual(['tenant-abc']);
  });
});

describe('PersonCollection', () => {
  it('should be "persons"', () => {
    expect(PersonCollection).toBe('persons');
  });
});
