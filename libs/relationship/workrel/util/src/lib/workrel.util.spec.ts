import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_WORKREL_TYPE, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { OrgModel, PersonModel, UserModel, WorkrelModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { convertPersonAndOrgToNewForm, newWorkrelFormModel, convertWorkrelToForm, convertFormToWorkrel, convertFormToNewWorkrel, isWorkrel, getWorkrelSearchIndex, getWorkrelSearchIndexInfo } from './workrel.util';
import { WorkrelFormModel } from 'libs/relationship/workrel/util/src/lib/workrel-form.model';

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

describe('Workrel Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const mockDie = vi.mocked(coreUtils.die);

  const tenantId = 'tenant-1';
  let workrel: WorkrelModel;
  let person: PersonModel;
  let org: OrgModel;
  let currentUser: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();

    workrel = new WorkrelModel(tenantId);
    workrel.bkey = 'wrel-1';
    workrel.subjectKey = 'person-1';
    workrel.subjectName1 = 'John';
    workrel.subjectName2 = 'Doe';
    workrel.objectKey = 'org-1';
    workrel.objectName = 'ACME Inc.';
    workrel.type = DEFAULT_WORKREL_TYPE;
    workrel.validFrom = '20230101';

    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'John';
    person.lastName = 'Doe';
    person.gender = 'male';

    org = new OrgModel(tenantId);
    org.bkey = 'org-1';
    org.name = 'ACME Inc.';
    org.type = 'legalEntity';

    currentUser = new UserModel(tenantId);
    currentUser.bkey = 'user-1';
  });

  describe('newWorkrelFormModel', () => {
    it('should return a default form model', () => {
      const formModel = newWorkrelFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.type).toBe('employee');
      expect(formModel.validFrom).toBe('20250904');
      expect(formModel.validTo).toBe(END_FUTURE_DATE_STR);
      expect(formModel.price).toBe(6000);
    });
  });

  describe('convertWorkrelToForm', () => {
    it('should convert a WorkrelModel to a form model', () => {
      const formModel = convertWorkrelToForm(workrel);
      expect(formModel.bkey).toBe('wrel-1');
      expect(formModel.subjectKey).toBe('person-1');
      expect(formModel.objectName).toBe('ACME Inc.');
    });

    it('should return a new form model if workrel is undefined', () => {
      const formModel = convertWorkrelToForm(undefined);
      expect(formModel.bkey).toBe('');
      expect(formModel.validFrom).toBe('20250904');
    });
  });

  describe('convertFormToWorkrel', () => {
    const formModel: WorkrelFormModel = {
      type: 'contractor',
      label: 'External Advisor',
      validFrom: '20240101',
      price: 8000,
    } as WorkrelFormModel;

    it('should update an existing workrel model', () => {
      const updated = convertFormToWorkrel(workrel, formModel, tenantId);
      expect(updated.type).toBe('contractor');
      expect(updated.label).toBe('External Advisor');
      expect(updated.price).toBe(8000);
    });

    it('should create a new workrel model if one is not provided', () => {
      const created = convertFormToWorkrel(undefined, formModel, tenantId);
      expect(created).toBeInstanceOf(WorkrelModel);
      expect(created.type).toBe('contractor');
    });
  });

  describe('convertPersonAndOrgToNewForm', () => {
    it('should create a new form model from a person and an org', () => {
      const formModel = convertPersonAndOrgToNewForm(person, org, currentUser);
      expect(formModel.subjectKey).toBe('person-1');
      expect(formModel.subjectName2).toBe('Doe');
      expect(formModel.objectKey).toBe('org-1');
      expect(formModel.objectName).toBe('ACME Inc.');
      expect(formModel.type).toBe('employee');
    });

    it('should call die if currentUser is not provided', () => {
      convertPersonAndOrgToNewForm(person, org, undefined);
      expect(mockDie).toHaveBeenCalledWith('workrel.util.convertPersonsToNewForm: currentUser is mandatory');
    });
  });

  describe('convertFormToNewWorkrel', () => {
    it('should create a new WorkrelModel from a form model', () => {
      const formModel: WorkrelFormModel = {
        subjectKey: 'person-1',
        objectKey: 'org-1',
        type: 'boardMember',
      } as WorkrelFormModel;
      const newRel = convertFormToNewWorkrel(formModel, tenantId);
      expect(newRel).toBeInstanceOf(WorkrelModel);
      expect(newRel.isArchived).toBe(false);
      expect(newRel.subjectKey).toBe('person-1');
      expect(newRel.type).toBe('boardMember');
    });
  });

  describe('isWorkrel', () => {
    it('should call isType with the correct parameters', () => {
      isWorkrel({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(WorkrelModel));
    });
  });

  describe('Search Index functions', () => {
    it('getWorkrelSearchIndex should return a formatted index string', () => {
      const index = getWorkrelSearchIndex(workrel);
      expect(index).toBe('sk:person-1 sn:John Doe ok:org-1 on:ACME Inc.');
    });

    it('getWorkrelSearchIndexInfo should return the info string', () => {
      expect(getWorkrelSearchIndexInfo()).toBe('sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName');
    });
  });
});
