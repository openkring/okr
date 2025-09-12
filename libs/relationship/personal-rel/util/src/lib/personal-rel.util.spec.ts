import { describe, it, expect, vi, beforeEach } from 'vitest';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { GenderType, PersonalRelModel, PersonalRelType, PersonModel, UserModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { newPersonalRelFormModel, convertPersonalRelToForm, convertFormToPersonalRel, convertPersonsToNewForm, convertFormToNewPersonalRel, getPersonalRelSearchIndex, getPersonalRelSearchIndexInfo } from './personal-rel.util';
import { PersonalRelFormModel } from './personal-rel-form.model';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    die: vi.fn(),
    getTodayStr: vi.fn().mockReturnValue('20250904'),
    addIndexElement: (index: string, key: string, value: string) => `${index} ${key}:${value}`.trim(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));

describe('PersonalRel Utils', () => {
  const mockDie = vi.mocked(coreUtils.die);

  const tenantId = 'tenant-1';
  let personalRel: PersonalRelModel;
  let subject: PersonModel;
  let object: PersonModel;
  let currentUser: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();

    personalRel = new PersonalRelModel(tenantId);
    personalRel.bkey = 'rel-1';
    personalRel.subjectKey = 'person-1';
    personalRel.subjectFirstName = 'John';
    personalRel.subjectLastName = 'Doe';
    personalRel.objectKey = 'person-2';
    personalRel.objectFirstName = 'Jane';
    personalRel.objectLastName = 'Smith';
    personalRel.type = PersonalRelType.Partner;
    personalRel.validFrom = '20230101';

    subject = new PersonModel(tenantId);
    subject.bkey = 'person-1';
    subject.firstName = 'John';
    subject.lastName = 'Doe';
    subject.gender = GenderType.Male;

    object = new PersonModel(tenantId);
    object.bkey = 'person-2';
    object.firstName = 'Jane';
    object.lastName = 'Smith';
    object.gender = GenderType.Female;

    currentUser = new UserModel(tenantId);
    currentUser.bkey = 'user-1';
  });

  describe('newPersonalRelFormModel', () => {
    it('should return a default form model', () => {
      const formModel = newPersonalRelFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.type).toBe(PersonalRelType.Partner);
      expect(formModel.validFrom).toBe('20250904');
      expect(formModel.validTo).toBe(END_FUTURE_DATE_STR);
    });
  });

  describe('convertPersonalRelToForm', () => {
    it('should convert a PersonalRelModel to a form model', () => {
      const formModel = convertPersonalRelToForm(personalRel);
      expect(formModel.bkey).toBe('rel-1');
      expect(formModel.subjectKey).toBe('person-1');
      expect(formModel.objectLastName).toBe('Smith');
    });

    it('should return a new form model if personalRel is undefined', () => {
      const formModel = convertPersonalRelToForm(undefined);
      expect(formModel.bkey).toBe('');
      expect(formModel.validFrom).toBe('20250904');
    });
  });

  describe('convertFormToPersonalRel', () => {
    const formModel: PersonalRelFormModel = {
      type: PersonalRelType.ParentChild,
      label: 'Son',
      validFrom: '20240101',
      notes: 'New notes',
    } as PersonalRelFormModel;

    it('should update an existing personalRel model', () => {
      const updated = convertFormToPersonalRel(personalRel, formModel, tenantId);
      expect(updated.type).toBe(PersonalRelType.ParentChild);
      expect(updated.label).toBe('Son');
      expect(updated.notes).toBe('New notes');
    });

    it('should create a new personalRel model if one is not provided', () => {
      const created = convertFormToPersonalRel(undefined, formModel, tenantId);
      expect(created).toBeInstanceOf(PersonalRelModel);
      expect(created.type).toBe(PersonalRelType.ParentChild);
    });
  });

  describe('convertPersonsToNewForm', () => {
    it('should create a new form model from subject and object persons', () => {
      const formModel = convertPersonsToNewForm(subject, object, currentUser);
      expect(formModel.subjectKey).toBe('person-1');
      expect(formModel.subjectLastName).toBe('Doe');
      expect(formModel.objectKey).toBe('person-2');
      expect(formModel.objectLastName).toBe('Smith');
      expect(formModel.type).toBe(PersonalRelType.Partner);
    });

    it('should call die if currentUser is not provided', () => {
      convertPersonsToNewForm(subject, object, undefined);
      expect(mockDie).toHaveBeenCalledWith('personal-rel.util.convertPersonsToNewForm: currentUser is mandatory');
    });
  });

  describe('convertFormToNewPersonalRel', () => {
    it('should create a new PersonalRelModel from a form model', () => {
      const formModel: PersonalRelFormModel = {
        subjectKey: 'person-1',
        objectKey: 'person-2',
        type: PersonalRelType.Sibling,
      } as PersonalRelFormModel;
      const newRel = convertFormToNewPersonalRel(formModel, tenantId);
      expect(newRel).toBeInstanceOf(PersonalRelModel);
      expect(newRel.isArchived).toBe(false);
      expect(newRel.subjectKey).toBe('person-1');
      expect(newRel.type).toBe(PersonalRelType.Sibling);
    });
  });

  describe('Search Index functions', () => {
    it('getPersonalRelSearchIndex should return a formatted index string', () => {
      const index = getPersonalRelSearchIndex(personalRel);
      expect(index).toBe('sk:person-1 sn:John Doe ok:person-2 on:Jane Smith');
    });

    it('getPersonalRelSearchIndexInfo should return the info string', () => {
      expect(getPersonalRelSearchIndexInfo()).toBe('sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName');
    });
  });
});
