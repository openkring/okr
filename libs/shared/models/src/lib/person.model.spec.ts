import { describe, expect, it } from 'vitest';
import { GenderType } from './enums/gender-type.enum';
import { PersonCollection, PersonModel } from './person.model';
describe('PersonModel', () => {
  it('should create an instance with tenantId', () => {
    const model = new PersonModel('tenant-123');
    expect(model).toBeInstanceOf(PersonModel);
    expect(model.tenants).toEqual(['tenant-123']);
  });

  it('should have default property values', () => {
    const model = new PersonModel('tenant-xyz');
    expect(model.bkey).toBe('');
    expect(model.isArchived).toBe(false);
    expect(model.index).toBe('');
    expect(model.tags).toBe('');
    expect(model.notes).toBe('');
    expect(model.firstName).toBe('');
    expect(model.lastName).toBe('');
    expect(model.gender).toBe(GenderType.Male);
    expect(model.ssnId).toBe('');
    expect(model.dateOfBirth).toBe('');
    expect(model.dateOfDeath).toBe('');
    expect(model.fav_email).toBe('');
    expect(model.fav_phone).toBe('');
    expect(model.fav_street).toBe('');
    expect(model.fav_zip).toBe('');
    expect(model.fav_city).toBe('');
    expect(model.fav_country).toBe('');
    expect(model.bexioId).toBe('');
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
