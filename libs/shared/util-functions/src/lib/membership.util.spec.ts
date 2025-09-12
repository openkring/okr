import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllMembershipsOfMember, getAllMembershipsOfOrg } from './membership.util';
import { searchData } from './search.util';
import { MembershipCollection, MembershipModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';

// Mock the searchData utility
vi.mock('./search.util', () => ({
  searchData: vi.fn(),
}));

describe('Membership Utils', () => {
  const mockSearchData = vi.mocked(searchData);
  const mockFirestore = {} as Firestore; // A simple mock object is sufficient

  beforeEach(() => {
    // Clear mocks before each test
    mockSearchData.mockClear();
  });

  describe('getAllMembershipsOfMember', () => {
    it('should call searchData with the correct query for a memberId', async () => {
      const memberId = 'member-123';
      const expectedQuery = [{ key: 'memberKey', operator: '==', value: memberId }];

      await getAllMembershipsOfMember(mockFirestore, memberId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, MembershipCollection, expectedQuery);
    });

    it('should return the memberships found by searchData', async () => {
      const memberId = 'member-123';
      const mockMemberships: MembershipModel[] = [{ memberKey: memberId, orgKey: 'org-1' } as MembershipModel, { memberKey: memberId, orgKey: 'org-2' } as MembershipModel];
      mockSearchData.mockResolvedValue(mockMemberships);

      const result = await getAllMembershipsOfMember(mockFirestore, memberId);

      expect(result).toEqual(mockMemberships);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllMembershipsOfOrg', () => {
    it('should call searchData with the correct query for an orgId', async () => {
      const orgId = 'org-456';
      const expectedQuery = [{ key: 'orgKey', operator: '==', value: orgId }];

      await getAllMembershipsOfOrg(mockFirestore, orgId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, MembershipCollection, expectedQuery);
    });

    it('should return the memberships found by searchData', async () => {
      const orgId = 'org-456';
      const mockMemberships: MembershipModel[] = [{ memberKey: 'member-1', orgKey: orgId } as MembershipModel, { memberKey: 'member-2', orgKey: orgId } as MembershipModel];
      mockSearchData.mockResolvedValue(mockMemberships);

      const result = await getAllMembershipsOfOrg(mockFirestore, orgId);

      expect(result).toEqual(mockMemberships);
      expect(result.length).toBe(2);
    });
  });
});
