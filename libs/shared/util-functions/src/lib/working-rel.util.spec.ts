import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllWorkingRelsOfSubject, getAllWorkingRelsOfObject } from './working-rel.util';
import { searchData } from './search.util';
import { WorkingRelCollection, WorkingRelModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';

// Mock the searchData utility
vi.mock('./search.util', () => ({
  searchData: vi.fn(),
}));

describe('WorkingRel Utils', () => {
  const mockSearchData = vi.mocked(searchData);
  const mockFirestore = {} as Firestore; // A simple mock object is sufficient

  beforeEach(() => {
    // Clear mocks before each test
    mockSearchData.mockClear();
  });

  describe('getAllWorkingRelsOfSubject', () => {
    it('should call searchData with the correct query for a subjectId', async () => {
      const subjectId = 'person-123';
      const expectedQuery = [{ key: 'subjectKey', operator: '==', value: subjectId }];

      await getAllWorkingRelsOfSubject(mockFirestore, subjectId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, WorkingRelCollection, expectedQuery);
    });

    it('should return the working relations found by searchData', async () => {
      const subjectId = 'person-123';
      const mockWorkingRels: WorkingRelModel[] = [{ subjectKey: subjectId, objectKey: 'org-1' } as WorkingRelModel, { subjectKey: subjectId, objectKey: 'org-2' } as WorkingRelModel];
      mockSearchData.mockResolvedValue(mockWorkingRels);

      const result = await getAllWorkingRelsOfSubject(mockFirestore, subjectId);

      expect(result).toEqual(mockWorkingRels);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllWorkingRelsOfObject', () => {
    it('should call searchData with the correct query for an objectId', async () => {
      const objectId = 'org-456';
      const expectedQuery = [{ key: 'objectKey', operator: '==', value: objectId }];

      await getAllWorkingRelsOfObject(mockFirestore, objectId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, WorkingRelCollection, expectedQuery);
    });

    it('should return the working relations found by searchData', async () => {
      const objectId = 'org-456';
      const mockWorkingRels: WorkingRelModel[] = [{ subjectKey: 'person-1', objectKey: objectId } as WorkingRelModel, { subjectKey: 'person-2', objectKey: objectId } as WorkingRelModel];
      mockSearchData.mockResolvedValue(mockWorkingRels);

      const result = await getAllWorkingRelsOfObject(mockFirestore, objectId);

      expect(result).toEqual(mockWorkingRels);
      expect(result.length).toBe(2);
    });
  });
});
