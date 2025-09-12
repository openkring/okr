import { describe, it, expect, vi, beforeEach } from 'vitest';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { GenderType, ModelType, OrgModel, OrgType, Periodicity, PersonModel, UserModel, WorkingRelModel, WorkingRelState, WorkingRelType } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { newWorkingRelFormModel, convertWorkingRelToForm, convertFormToWorkingRel, convertPersonAndOrgToNewForm, convertFormToNewWorkingRel, isWorkingRel, getWorkingRelSearchIndex, getWorkingRelSearchIndexInfo } from './working-rel.util';
import { WorkingRelFormModel } from './working-rel-form.model';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
    die: vi.fn(),
    getTodayStr: vi.fn().mockReturnValue('20250904'),
    addIndexElement: (index: string, key: string, value: string) => `${index} ${key}:${value}`.trim(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));

describe('WorkingRel Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const mockDie = vi.mocked(coreUtils.die);

  const tenantId = 'tenant-1';
  let workingRel: WorkingRelModel;
  let person: PersonModel;
  let org: OrgModel;
  let currentUser: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();

    workingRel = new WorkingRelModel(tenantId);
    workingRel.bkey = 'wrel-1';
    workingRel.subjectKey = 'person-1';
    workingRel.subjectName1 = 'John';
    workingRel.subjectName2 = 'Doe';
    workingRel.objectKey = 'org-1';
    workingRel.objectName = 'ACME Inc.';
    workingRel.type = WorkingRelType.Employee;
    workingRel.validFrom = '20230101';

    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'John';
    person.lastName = 'Doe';
    person.gender = GenderType.Male;

    org = new OrgModel(tenantId);
    org.bkey = 'org-1';
    org.name = 'ACME Inc.';
    org.type = OrgType.LegalEntity;

    currentUser = new UserModel(tenantId);
    currentUser.bkey = 'user-1';
  });

  describe('newWorkingRelFormModel', () => {
    it('should return a default form model', () => {
      const formModel = newWorkingRelFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.type).toBe(WorkingRelType.Employee);
      expect(formModel.validFrom).toBe('20250904');
      expect(formModel.validTo).toBe(END_FUTURE_DATE_STR);
      expect(formModel.price).toBe(6000);
    });
  });

  describe('convertWorkingRelToForm', () => {
    it('should convert a WorkingRelModel to a form model', () => {
      const formModel = convertWorkingRelToForm(workingRel);
      expect(formModel.bkey).toBe('wrel-1');
      expect(formModel.subjectKey).toBe('person-1');
      expect(formModel.objectName).toBe('ACME Inc.');
    });

    it('should return a new form model if workingRel is undefined', () => {
      const formModel = convertWorkingRelToForm(undefined);
      expect(formModel.bkey).toBe('');
      expect(formModel.validFrom).toBe('20250904');
    });
  });

  describe('convertFormToWorkingRel', () => {
    const formModel: WorkingRelFormModel = {
      type: WorkingRelType.Contractor,
      label: 'External Advisor',
      validFrom: '20240101',
      price: 8000,
    } as WorkingRelFormModel;

    it('should update an existing workingRel model', () => {
      const updated = convertFormToWorkingRel(workingRel, formModel, tenantId);
      expect(updated.type).toBe(WorkingRelType.Contractor);
      expect(updated.label).toBe('External Advisor');
      expect(updated.price).toBe(8000);
    });

    it('should create a new workingRel model if one is not provided', () => {
      const created = convertFormToWorkingRel(undefined, formModel, tenantId);
      expect(created).toBeInstanceOf(WorkingRelModel);
      expect(created.type).toBe(WorkingRelType.Contractor);
    });
  });

  describe('convertPersonAndOrgToNewForm', () => {
    it('should create a new form model from a person and an org', () => {
      const formModel = convertPersonAndOrgToNewForm(person, org, currentUser);
      expect(formModel.subjectKey).toBe('person-1');
      expect(formModel.subjectName2).toBe('Doe');
      expect(formModel.objectKey).toBe('org-1');
      expect(formModel.objectName).toBe('ACME Inc.');
      expect(formModel.type).toBe(WorkingRelType.Employee);
    });

    it('should call die if currentUser is not provided', () => {
      convertPersonAndOrgToNewForm(person, org, undefined);
      expect(mockDie).toHaveBeenCalledWith('working-rel.util.convertPersonsToNewForm: currentUser is mandatory');
    });
  });

  describe('convertFormToNewWorkingRel', () => {
    it('should create a new WorkingRelModel from a form model', () => {
      const formModel: WorkingRelFormModel = {
        subjectKey: 'person-1',
        objectKey: 'org-1',
        type: WorkingRelType.BoardMember,
      } as WorkingRelFormModel;
      const newRel = convertFormToNewWorkingRel(formModel, tenantId);
      expect(newRel).toBeInstanceOf(WorkingRelModel);
      expect(newRel.isArchived).toBe(false);
      expect(newRel.subjectKey).toBe('person-1');
      expect(newRel.type).toBe(WorkingRelType.BoardMember);
    });
  });

  describe('isWorkingRel', () => {
    it('should call isType with the correct parameters', () => {
      isWorkingRel({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(WorkingRelModel));
    });
  });

  describe('Search Index functions', () => {
    it('getWorkingRelSearchIndex should return a formatted index string', () => {
      const index = getWorkingRelSearchIndex(workingRel);
      expect(index).toBe('sk:person-1 sn:John Doe ok:org-1 on:ACME Inc.');
    });

    it('getWorkingRelSearchIndexInfo should return the info string', () => {
      expect(getWorkingRelSearchIndexInfo()).toBe('sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName');
    });
  });
});
