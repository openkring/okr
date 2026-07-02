import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllWorkrelsOfSubject, getAllWorkrelsOfObject } from './working-rel.util';
import { searchData } from './search.util';
import { WorkrelCollection, WorkrelModel } from '@bk2/shared-models';
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

  describe('getAllWorkrelsOfSubject', () => {
    it('should call searchData filtering by subjectKey and subjectModelType', async () => {
      const subjectId = 'person-123';
      const expectedQuery = [
        { key: 'subjectKey', operator: '==', value: subjectId },
        { key: 'subjectModelType', operator: '==', value: 'person' },
      ];

      await getAllWorkrelsOfSubject(mockFirestore, subjectId, 'person');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, WorkrelCollection, expectedQuery, 'objectName', 'asc');
    });

    it('should filter by subjectModelType=org (key collision guard)', async () => {
      const subjectId = 'scs';
      const expectedQuery = [
        { key: 'subjectKey', operator: '==', value: subjectId },
        { key: 'subjectModelType', operator: '==', value: 'org' },
      ];

      await getAllWorkrelsOfSubject(mockFirestore, subjectId, 'org');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, WorkrelCollection, expectedQuery, 'objectName', 'asc');
    });

    it('should return the working relations found by searchData', async () => {
      const subjectId = 'person-123';
      const mockWorkingRels: WorkrelModel[] = [{ subjectKey: subjectId, objectKey: 'org-1' } as WorkrelModel, { subjectKey: subjectId, objectKey: 'org-2' } as WorkrelModel];
      mockSearchData.mockResolvedValue(mockWorkingRels);

      const result = await getAllWorkrelsOfSubject(mockFirestore, subjectId, 'person');

      expect(result).toEqual(mockWorkingRels);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllWorkrelsOfObject', () => {
    it('should call searchData with the correct query for an objectId', async () => {
      const objectId = 'org-456';
      const expectedQuery = [{ key: 'objectKey', operator: '==', value: objectId }];

      await getAllWorkrelsOfObject(mockFirestore, objectId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, WorkrelCollection, expectedQuery, 'subjectName2', 'asc');
    });

    it('should return the working relations found by searchData', async () => {
      const objectId = 'org-456';
      const mockWorkingRels: WorkrelModel[] = [{ subjectKey: 'person-1', objectKey: objectId } as WorkrelModel, { subjectKey: 'person-2', objectKey: objectId } as WorkrelModel];
      mockSearchData.mockResolvedValue(mockWorkingRels);

      const result = await getAllWorkrelsOfObject(mockFirestore, objectId);

      expect(result).toEqual(mockWorkingRels);
      expect(result.length).toBe(2);
    });
  });
});
