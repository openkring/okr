import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersonModel } from '@bk2/shared-models';

// person.util imports formatAhv from @bk2/shared-util-angular, which transitively pulls in
// @ionic/angular. Mock it so these pure-function tests don't load Ionic ES modules.
vi.mock('@bk2/shared-util-angular', () => ({
  formatAhv: vi.fn((ssnId, format) => `formatted:${ssnId}:${format}`),
  AhvFormat: {
    Friendly: 'friendly',
    Electronic: 'electronic',
  },
}));

import { getPersonIndex, getPersonIndexInfo } from './person.util';

describe('Person Utils', () => {
  const tenantId = 'tenant-1';
  let person: PersonModel;

  beforeEach(() => {
    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'John';
    person.lastName = 'Doe';
    person.gender = 'male';
    person.dateOfBirth = '19900101';
    person.favZipCode = '8000';
    person.bexioId = '42';
    person.ssnId = '123.4567.8901.23';
    person.notes = 'Some notes';
  });

  describe('getPersonIndex', () => {
    it('builds an index from name, zip, firstName, bexioId and dateOfBirth', () => {
      expect(getPersonIndex(person)).toBe('n:Doe z:8000 fn:John bx:42 dob:19900101');
    });

    it('skips empty values', () => {
      person.favZipCode = '';
      person.bexioId = '';
      expect(getPersonIndex(person)).toBe('n:Doe fn:John dob:19900101');
    });
  });

  describe('getPersonIndexInfo', () => {
    it('describes the index structure', () => {
      expect(getPersonIndexInfo()).toBe('n:name z:zipCode fn:firstName dob:dateOfBirth bx:bexioId');
    });
  });
});
