import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MembershipModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { getMembershipIndex, getMembershipIndexInfo } from './membership.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
}));

describe('Membership Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let membership: MembershipModel;

  beforeEach(() => {
    vi.clearAllMocks();
    membership = new MembershipModel(tenantId);
    membership.bkey = 'membership-1';
    membership.memberKey = 'person-1';
    membership.memberName1 = 'John';
    membership.memberName2 = 'Doe';
    membership.memberModelType = 'person';
    membership.memberType = 'male';
    membership.orgKey = 'org-1';
    membership.orgName = 'Test Club';
    membership.dateOfEntry = '20200101';
    membership.category = 'active';
    membership.price = 100;
    membership.periodicity = 'yearly';
  });

  describe('getMembershipIndex', () => {
    it('builds the index from member and org fields', () => {
      expect(getMembershipIndex(membership)).toBe('mn:John Doe mk:person-1 ok:org-1 on:Test Club');
    });

    it('appends the nickname when present', () => {
      membership.memberNickName = 'Johnny';
      expect(getMembershipIndex(membership)).toBe('mn:John Doe mk:person-1 ok:org-1 on:Test Club nn:Johnny');
    });
  });

  describe('getMembershipIndexInfo', () => {
    it('describes the index structure', () => {
      expect(getMembershipIndexInfo()).toBe('mn:memberName mk:memberKey ok:orgKey on:orgName [nn:nickName]');
    });
  });
});
