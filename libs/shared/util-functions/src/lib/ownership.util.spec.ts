import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllOwnershipsOfOwner, getAllOwnershipsOfResource } from './ownership.util';
import { searchData } from './search.util';
import { OwnershipCollection, OwnershipModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';

// Mock the searchData utility
vi.mock('./search.util', () => ({
  searchData: vi.fn(),
}));

describe('Ownership Utils', () => {
  const mockSearchData = vi.mocked(searchData);
  const mockFirestore = {} as Firestore; // A simple mock object is sufficient

  beforeEach(() => {
    // Clear mocks before each test
    mockSearchData.mockClear();
  });

  describe('getAllOwnershipsOfOwner', () => {
    it('should call searchData filtering by ownerKey and ownerModelType', async () => {
      const ownerId = 'owner-123';
      const expectedQuery = [
        { key: 'ownerKey', operator: '==', value: ownerId },
        { key: 'ownerModelType', operator: '==', value: 'person' },
      ];

      await getAllOwnershipsOfOwner(mockFirestore, ownerId, 'person');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, OwnershipCollection, expectedQuery, 'resourceName', 'asc');
    });

    it('should filter by ownerModelType=org (key collision guard)', async () => {
      const ownerId = 'scs';
      const expectedQuery = [
        { key: 'ownerKey', operator: '==', value: ownerId },
        { key: 'ownerModelType', operator: '==', value: 'org' },
      ];

      await getAllOwnershipsOfOwner(mockFirestore, ownerId, 'org');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, OwnershipCollection, expectedQuery, 'resourceName', 'asc');
    });

    it('should return the ownerships found by searchData', async () => {
      const ownerId = 'owner-123';
      const mockOwnerships: OwnershipModel[] = [{ ownerKey: ownerId, resourceKey: 'resource-1' } as OwnershipModel, { ownerKey: ownerId, resourceKey: 'resource-2' } as OwnershipModel];
      mockSearchData.mockResolvedValue(mockOwnerships);

      const result = await getAllOwnershipsOfOwner(mockFirestore, ownerId, 'person');

      expect(result).toEqual(mockOwnerships);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllOwnershipsOfResource', () => {
    it('should call searchData filtering by resourceKey and resourceModelType', async () => {
      const resourceId = 'resource-456';
      const expectedQuery = [
        { key: 'resourceKey', operator: '==', value: resourceId },
        { key: 'resourceModelType', operator: '==', value: 'resource' },
      ];

      await getAllOwnershipsOfResource(mockFirestore, resourceId, 'resource');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, OwnershipCollection, expectedQuery, 'ownerName2', 'asc');
    });

    it('should filter by resourceModelType=account (key collision guard)', async () => {
      const resourceId = 'acc-1';
      const expectedQuery = [
        { key: 'resourceKey', operator: '==', value: resourceId },
        { key: 'resourceModelType', operator: '==', value: 'account' },
      ];

      await getAllOwnershipsOfResource(mockFirestore, resourceId, 'account');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, OwnershipCollection, expectedQuery, 'ownerName2', 'asc');
    });

    it('should return the ownerships found by searchData', async () => {
      const resourceId = 'resource-456';
      const mockOwnerships: OwnershipModel[] = [{ ownerKey: 'owner-1', resourceKey: resourceId } as OwnershipModel, { ownerKey: 'owner-2', resourceKey: resourceId } as OwnershipModel];
      mockSearchData.mockResolvedValue(mockOwnerships);

      const result = await getAllOwnershipsOfResource(mockFirestore, resourceId, 'resource');

      expect(result).toEqual(mockOwnerships);
      expect(result.length).toBe(2);
    });
  });
});
