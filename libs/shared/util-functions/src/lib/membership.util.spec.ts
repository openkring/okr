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
    it('should call searchData filtering by memberKey and memberModelType', async () => {
      const memberId = 'member-123';
      const expectedQuery = [
        { key: 'memberKey', operator: '==', value: memberId },
        { key: 'memberModelType', operator: '==', value: 'person' },
      ];

      await getAllMembershipsOfMember(mockFirestore, memberId, 'person');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, MembershipCollection, expectedQuery, 'orgName', 'asc');
    });

    it('should filter by memberModelType=org (key collision guard)', async () => {
      const memberId = 'scs';
      const expectedQuery = [
        { key: 'memberKey', operator: '==', value: memberId },
        { key: 'memberModelType', operator: '==', value: 'org' },
      ];

      await getAllMembershipsOfMember(mockFirestore, memberId, 'org');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, MembershipCollection, expectedQuery, 'orgName', 'asc');
    });

    it('should return the memberships found by searchData', async () => {
      const memberId = 'member-123';
      const mockMemberships: MembershipModel[] = [{ memberKey: memberId, orgKey: 'org-1' } as MembershipModel, { memberKey: memberId, orgKey: 'org-2' } as MembershipModel];
      mockSearchData.mockResolvedValue(mockMemberships);

      const result = await getAllMembershipsOfMember(mockFirestore, memberId, 'person');

      expect(result).toEqual(mockMemberships);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllMembershipsOfOrg', () => {
    it('should call searchData filtering by orgKey and orgModelType=org', async () => {
      const orgId = 'org-456';
      const expectedQuery = [
        { key: 'orgKey', operator: '==', value: orgId },
        { key: 'orgModelType', operator: '==', value: 'org' },
      ];

      await getAllMembershipsOfOrg(mockFirestore, orgId, 'org');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, MembershipCollection, expectedQuery, 'memberName2', 'asc');
    });

    it('should call searchData filtering by orgKey and orgModelType=group (key collision guard)', async () => {
      const orgId = 'scs';
      const expectedQuery = [
        { key: 'orgKey', operator: '==', value: orgId },
        { key: 'orgModelType', operator: '==', value: 'group' },
      ];

      await getAllMembershipsOfOrg(mockFirestore, orgId, 'group');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, MembershipCollection, expectedQuery, 'memberName2', 'asc');
    });

    it('should return the memberships found by searchData', async () => {
      const orgId = 'org-456';
      const mockMemberships: MembershipModel[] = [{ memberKey: 'member-1', orgKey: orgId } as MembershipModel, { memberKey: 'member-2', orgKey: orgId } as MembershipModel];
      mockSearchData.mockResolvedValue(mockMemberships);

      const result = await getAllMembershipsOfOrg(mockFirestore, orgId, 'org');

      expect(result).toEqual(mockMemberships);
      expect(result.length).toBe(2);
    });
  });
});
