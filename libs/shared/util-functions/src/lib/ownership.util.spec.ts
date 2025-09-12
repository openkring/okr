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
    it('should call searchData with the correct query for an ownerId', async () => {
      const ownerId = 'owner-123';
      const expectedQuery = [{ key: 'ownerKey', operator: '==', value: ownerId }];

      await getAllOwnershipsOfOwner(mockFirestore, ownerId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, OwnershipCollection, expectedQuery);
    });

    it('should return the ownerships found by searchData', async () => {
      const ownerId = 'owner-123';
      const mockOwnerships: OwnershipModel[] = [{ ownerKey: ownerId, objectKey: 'resource-1' } as OwnershipModel, { ownerKey: ownerId, objectKey: 'resource-2' } as OwnershipModel];
      mockSearchData.mockResolvedValue(mockOwnerships);

      const result = await getAllOwnershipsOfOwner(mockFirestore, ownerId);

      expect(result).toEqual(mockOwnerships);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllOwnershipsOfResource', () => {
    it('should call searchData with the correct query for a resourceId', async () => {
      const resourceId = 'resource-456';
      const expectedQuery = [{ key: 'objectKey', operator: '==', value: resourceId }];

      await getAllOwnershipsOfResource(mockFirestore, resourceId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, OwnershipCollection, expectedQuery);
    });

    it('should return the ownerships found by searchData', async () => {
      const resourceId = 'resource-456';
      const mockOwnerships: OwnershipModel[] = [{ ownerKey: 'owner-1', objectKey: resourceId } as OwnershipModel, { ownerKey: 'owner-2', objectKey: resourceId } as OwnershipModel];
      mockSearchData.mockResolvedValue(mockOwnerships);

      const result = await getAllOwnershipsOfResource(mockFirestore, resourceId);

      expect(result).toEqual(mockOwnerships);
      expect(result.length).toBe(2);
    });
  });
});
