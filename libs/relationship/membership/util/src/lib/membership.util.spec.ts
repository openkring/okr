import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MembershipModel, ModelType, GenderType, Periodicity } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isMembership, convertMembershipToForm, convertFormToMembership } from './membership.util';
import { MembershipFormModel } from './membership-form.model';

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
    membership.memberModelType = ModelType.Person;
    membership.memberType = GenderType.Male;
    membership.orgKey = 'org-1';
    membership.orgName = 'Test Club';
    membership.dateOfEntry = '20200101';
    membership.membershipCategory = 'active';
    membership.price = 100;
    membership.periodicity = Periodicity.Yearly;
  });

  describe('convertMembershipToForm', () => {
    it('should convert a MembershipModel to a MembershipFormModel', () => {
      const formModel = convertMembershipToForm(membership);
      expect(formModel.bkey).toBe('membership-1');
      expect(formModel.memberKey).toBe('person-1');
      expect(formModel.orgKey).toBe('org-1');
      expect(formModel.dateOfEntry).toBe('20200101');
      expect(formModel.price).toBe(100);
    });
  });

  describe('convertFormToMembership', () => {
    let formModel: MembershipFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'membership-1',
        memberKey: 'person-1',
        orgKey: 'org-1',
        dateOfEntry: '20210101',
        dateOfExit: '20251231',
        membershipCategory: 'passive',
        price: 50,
        periodicity: Periodicity.Monthly,
        orgFunction: 'Treasurer',
      } as MembershipFormModel;
    });

    it('should update an existing MembershipModel from a form model', () => {
      const updatedMembership = convertFormToMembership(membership, formModel, tenantId);
      expect(updatedMembership.dateOfEntry).toBe('20210101');
      expect(updatedMembership.membershipCategory).toBe('passive');
      expect(updatedMembership.price).toBe(50);
      expect(updatedMembership.periodicity).toBe(Periodicity.Monthly);
      expect(updatedMembership.bkey).toBe('membership-1'); // Should not be changed
    });

    it('should create a new MembershipModel if one is not provided', () => {
      const newMembership = convertFormToMembership(undefined, formModel, tenantId);
      expect(newMembership).toBeInstanceOf(MembershipModel);
      expect(newMembership.dateOfEntry).toBe('20210101');
      expect(newMembership.tenants).toEqual([tenantId]);
    });
  });
});
