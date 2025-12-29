import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_WORKREL_TYPE } from '@bk2/shared-constants';
import { OrgModel, PersonModel, UserModel, WorkrelModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { getWorkrelIndex, getWorkrelIndexInfo, isWorkrel } from './workrel.util';

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

  describe('isWorkrel', () => {
    it('should call isType with the correct parameters', () => {
      isWorkrel({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(WorkrelModel));
    });
  });

  describe('Search Index functions', () => {
    it('getWorkrelSearchIndex should return a formatted index string', () => {
      const index = getWorkrelIndex(workrel);
      expect(index).toBe('sk:person-1 sn:John Doe ok:org-1 on:ACME Inc.');
    });

    it('getWorkrelSearchIndexInfo should return the info string', () => {
      expect(getWorkrelIndexInfo()).toBe('sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName');
    });
  });
});
