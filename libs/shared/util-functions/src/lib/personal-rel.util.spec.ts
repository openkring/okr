import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllPersonalRelsOfSubject, getAllPersonalRelsOfObject } from './personal-rel.util';
import { searchData } from './search.util';
import { PersonalRelCollection, PersonalRelModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';

// Mock the searchData utility
vi.mock('./search.util', () => ({
  searchData: vi.fn(),
}));

describe('PersonalRel Utils', () => {
  const mockSearchData = vi.mocked(searchData);
  const mockFirestore = {} as Firestore; // A simple mock object is sufficient

  beforeEach(() => {
    // Clear mocks before each test
    mockSearchData.mockClear();
  });

  describe('getAllPersonalRelsOfSubject', () => {
    it('should call searchData with the correct query for a subjectId', async () => {
      const subjectId = 'person-123';
      const expectedQuery = [{ key: 'subjectKey', operator: '==', value: subjectId }];

      await getAllPersonalRelsOfSubject(mockFirestore, subjectId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, PersonalRelCollection, expectedQuery);
    });

    it('should return the personal relations found by searchData', async () => {
      const subjectId = 'person-123';
      const mockPersonalRels: PersonalRelModel[] = [{ subjectKey: subjectId, objectKey: 'person-456' } as PersonalRelModel, { subjectKey: subjectId, objectKey: 'person-789' } as PersonalRelModel];
      mockSearchData.mockResolvedValue(mockPersonalRels);

      const result = await getAllPersonalRelsOfSubject(mockFirestore, subjectId);

      expect(result).toEqual(mockPersonalRels);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllPersonalRelsOfObject', () => {
    it('should call searchData with the correct query for an objectId', async () => {
      const objectId = 'person-456';
      const expectedQuery = [{ key: 'objectKey', operator: '==', value: objectId }];

      await getAllPersonalRelsOfObject(mockFirestore, objectId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, PersonalRelCollection, expectedQuery);
    });

    it('should return the personal relations found by searchData', async () => {
      const objectId = 'person-456';
      const mockPersonalRels: PersonalRelModel[] = [{ subjectKey: 'person-1', objectKey: objectId } as PersonalRelModel, { subjectKey: 'person-2', objectKey: objectId } as PersonalRelModel];
      mockSearchData.mockResolvedValue(mockPersonalRels);

      const result = await getAllPersonalRelsOfObject(mockFirestore, objectId);

      expect(result).toEqual(mockPersonalRels);
      expect(result.length).toBe(2);
    });
  });
});
