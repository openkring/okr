import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersonModel } from '@okr/shared-models';

// person.util imports formatAhv from @okr/shared-util-angular, which transitively pulls in
// @ionic/angular. Mock it so these pure-function tests don't load Ionic ES modules.
vi.mock('@okr/shared-util-angular', () => ({
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
    person.okey = 'person-1';
    person.firstName = 'John';
    person.lastName = 'Doe';
    person.gender = 'male';
    // no dateOfBirth/ssnId here: both moved to the addresses vault in spec 1.19 Phase 4 and
    // no longer exist on PersonModel (the index dropped them in Phase 3).
    person.favZipCode = '8000';
    person.bexioId = '42';
    person.notes = 'Some notes';
  });

  describe('getPersonIndex', () => {
    // dob dropped from the index in spec 1.19 Phase 3 (moves to the privileged vault).
    it('builds an index from name, zip, firstName and bexioId', () => {
      expect(getPersonIndex(person)).toBe('n:Doe z:8000 fn:John bx:42');
    });

    it('skips empty values', () => {
      person.favZipCode = '';
      person.bexioId = '';
      expect(getPersonIndex(person)).toBe('n:Doe fn:John');
    });

    it('adds the nickname so the person is found by it', () => {
      person.nickname = 'Johnny';
      expect(getPersonIndex(person)).toBe('n:Doe z:8000 fn:John bx:42 nn:Johnny');
    });

    it('adds the maiden name so the person is found by it', () => {
      person.maidenName = 'Smith';
      expect(getPersonIndex(person)).toBe('n:Doe z:8000 fn:John bx:42 mn:Smith');
    });
  });

  describe('getPersonIndexInfo', () => {
    it('describes the index structure', () => {
      expect(getPersonIndexInfo()).toBe('n:name z:zipCode fn:firstName bx:bexioId nn:nickName mn:maidenName');
    });
  });
});
