import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenderType, PersonModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { convertPersonToForm, convertFormToPerson } from './person.util';
import { PersonFormModel } from './person-form.model';
import * as angularUtils from '@bk2/shared-util-angular';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});
// Mock any problematic external dependencies to isolate the test
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));
vi.mock('@bk2/shared-util-angular', () => ({
  copyToClipboard: vi.fn(),
  showToast: vi.fn(),
  formatAhv: vi.fn((ssnId, format) => `formatted:${ssnId}:${format}`),
  AhvFormat: {
    Friendly: 'friendly',
    Electronic: 'electronic',
  },
}));

describe('Person Utils', () => {
  const mockFormatAhv = vi.mocked(angularUtils.formatAhv);
  const tenantId = 'tenant-1';
  let person: PersonModel;

  beforeEach(() => {
    vi.clearAllMocks();
    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'John';
    person.lastName = 'Doe';
    person.gender = GenderType.Male;
    person.dateOfBirth = '19900101';
    person.ssnId = '123.4567.8901.23';
    person.notes = 'Some notes';
  });

  describe('convertPersonToForm', () => {
    it('should convert a PersonModel to a PersonFormModel', () => {
      const formModel = convertPersonToForm(person);
      expect(formModel.bkey).toBe('person-1');
      expect(formModel.firstName).toBe('John');
      expect(formModel.lastName).toBe('Doe');
      expect(mockFormatAhv).toHaveBeenCalledWith('123.4567.8901.23', 'friendly');
    });
  });

  describe('convertFormToPerson', () => {
    let formModel: PersonFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'person-1',
        firstName: 'Jane',
        lastName: 'Smith',
        gender: GenderType.Female,
        dateOfBirth: '19920202',
        ssnId: '756.6543.2109.87',
        notes: 'Updated notes',
      };
    });

    it('should update an existing PersonModel from a form model', () => {
      const updatedPerson = convertFormToPerson(person, formModel, tenantId);
      expect(updatedPerson.firstName).toBe('Jane');
      expect(updatedPerson.lastName).toBe('Smith');
      expect(updatedPerson.gender).toBe(GenderType.Female);
      expect(updatedPerson.ssnId).toBe('formatted:756.6543.2109.87:electronic');
      expect(mockFormatAhv).toHaveBeenCalledWith('756.6543.2109.87', 'electronic');
    });

    it('should create a new PersonModel if one is not provided', () => {
      const newPerson = convertFormToPerson(undefined, formModel, tenantId);
      expect(newPerson).toBeInstanceOf(PersonModel);
      expect(newPerson.firstName).toBe('Jane');
      expect(newPerson.tenants[0]).toBe(tenantId);
    });
  });
});
