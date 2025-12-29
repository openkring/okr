import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonalRelModel, PersonModel, UserModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { getPersonalRelIndex, getPersonalRelIndexInfo } from './personal-rel.util';

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
    personalRel.type = 'partner';
    personalRel.validFrom = '20230101';

    subject = new PersonModel(tenantId);
    subject.bkey = 'person-1';
    subject.firstName = 'John';
    subject.lastName = 'Doe';
    subject.gender = 'male';

    object = new PersonModel(tenantId);
    object.bkey = 'person-2';
    object.firstName = 'Jane';
    object.lastName = 'Smith';
    object.gender = 'female';

    currentUser = new UserModel(tenantId);
    currentUser.bkey = 'user-1';
  });

  describe('Search Index functions', () => {
    it('getPersonalRelIndex should return a formatted index string', () => {
      const index = getPersonalRelIndex(personalRel);
      expect(index).toBe('sk:person-1 sn:John Doe ok:person-2 on:Jane Smith');
    });

    it('getPersonalRelIndexInfo should return the info string', () => {
      expect(getPersonalRelIndexInfo()).toBe('sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName');
    });
  });
});
