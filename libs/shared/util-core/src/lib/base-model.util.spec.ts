import { BkModel } from '@bk2/shared-models';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addIndexElement, sortModels } from './base-model.util';
import { SortCriteria, SortDirection, SortField, sortAscending, sortDescending } from './sort.util';

// Mock the sort.util module
vi.mock('./sort.util', () => ({
  SortDirection: {
    Ascending: 'asc',
    Descending: 'desc'
  },
  SortField: {
    Name: 'name',
    State: 'state'
  },
  sortAscending: vi.fn(),
  sortDescending: vi.fn()
}));

describe('base-model.util', () => {
  const mockSortAscending = vi.mocked(sortAscending);
  const mockSortDescending = vi.mocked(sortDescending);

  // Helper function to create test models
  const createTestModel = (key: string, name: string, additionalProps: any = {}): BkModel => ({
    key,
    name,
    index: '',
    tags: '',
    state: 'active',
    ...additionalProps
  } as BkModel);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sortModels', () => {
    const testModels: BkModel[] = [
      createTestModel('1', 'Model A'),
      createTestModel('2', 'Model B'),
      createTestModel('3', 'Model C')
    ];

    it('should call sortAscending when direction is Ascending', () => {
      const sortCriteria: SortCriteria = {
        field: SortField.Name,
        direction: SortDirection.Ascending,
        typeIsString: true
      };
      const expectedResult = [...testModels].reverse();
      mockSortAscending.mockReturnValue(expectedResult);

      const result = sortModels(testModels, sortCriteria);

      expect(mockSortAscending).toHaveBeenCalledWith(testModels, 'name', true);
      expect(mockSortDescending).not.toHaveBeenCalled();
      expect(result).toBe(expectedResult);
    });

    it('should call sortDescending when direction is Descending', () => {
      const sortCriteria: SortCriteria = {
        field: SortField.Name,
        direction: SortDirection.Descending,
        typeIsString: true
      };
      const expectedResult = [...testModels].reverse();
      mockSortDescending.mockReturnValue(expectedResult);

      const result = sortModels(testModels, sortCriteria);

      expect(mockSortDescending).toHaveBeenCalledWith(testModels, 'name', true);
      expect(mockSortAscending).not.toHaveBeenCalled();
      expect(result).toBe(expectedResult);
    });

    it('should return original models when direction is neither Ascending nor Descending', () => {
      const sortCriteria: SortCriteria = {
        field: SortField.Name,
        direction: SortDirection.Undefined,
        typeIsString: true
      };

      const result = sortModels(testModels, sortCriteria);

      expect(mockSortAscending).not.toHaveBeenCalled();
      expect(mockSortDescending).not.toHaveBeenCalled();
      expect(result).toBe(testModels);
    });

    it('should handle empty models array', () => {
      const sortCriteria: SortCriteria = {
        field: SortField.Name,
        direction: SortDirection.Ascending,
        typeIsString: true
      };
      mockSortAscending.mockReturnValue([]);

      const result = sortModels([], sortCriteria);

      expect(mockSortAscending).toHaveBeenCalledWith([], 'name', true);
      expect(result).toEqual([]);
    });

    it('should pass correct parameters for non-string field', () => {
      const sortCriteria: SortCriteria = {
        field: SortField.State,
        direction: SortDirection.Ascending,
        typeIsString: false
      };
      mockSortAscending.mockReturnValue(testModels);

      sortModels(testModels, sortCriteria);

      expect(mockSortAscending).toHaveBeenCalledWith(testModels, SortField.State, false);
    });
  });

  describe('addIndexElement', () => {
    it('should add key-value pair to existing index', () => {
      const index = 'existing content';
      const key = 'category';
      const value = 'test';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing content category:test');
    });

    it('should add key-value pair to empty index', () => {
      const index = '';
      const key = 'category';
      const value = 'test';

      const result = addIndexElement(index, key, value);

      expect(result).toBe(' category:test');
    });

    it('should handle numeric values', () => {
      const index = 'existing';
      const key = 'count';
      const value = 42;

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing count:42');
    });

    it('should handle boolean values', () => {
      const index = 'existing';
      const key = 'active';
      const value = true;

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing active:true');
    });

    it('should handle false boolean values', () => {
      const index = 'existing';
      const key = 'disabled';
      const value = false;

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing disabled:false');
    });

    it('should return original index when key is null', () => {
      const index = 'existing content';
      const key = null;
      const value = 'test';

      const result = addIndexElement(index, key!, value);

      expect(result).toBe('existing content');
    });

    it('should return original index when key is undefined', () => {
      const index = 'existing content';
      const key = undefined;
      const value = 'test';

      const result = addIndexElement(index, key!, value);

      expect(result).toBe('existing content');
    });

    it('should return original index when key is empty string', () => {
      const index = 'existing content';
      const key = '';
      const value = 'test';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing content');
    });

    it('should return original index when string value is empty', () => {
      const index = 'existing content';
      const key = 'category';
      const value = '';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing content');
    });

    it('should return original index when string value is single space', () => {
      const index = 'existing content';
      const key = 'category';
      const value = ' ';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing content');
    });

    it('should handle string value with multiple spaces', () => {
      const index = 'existing';
      const key = 'description';
      const value = 'multiple spaces';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing description:multiple spaces');
    });

    it('should handle string value starting with space but having content', () => {
      const index = 'existing';
      const key = 'name';
      const value = ' test';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing name: test');
    });

    it('should handle zero as numeric value', () => {
      const index = 'existing';
      const key = 'count';
      const value = 0;

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing count:0');
    });

    it('should handle negative numbers', () => {
      const index = 'existing';
      const key = 'balance';
      const value = -50;

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing balance:-50');
    });

    it('should handle decimal numbers', () => {
      const index = 'existing';
      const key = 'price';
      const value = 19.99;

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing price:19.99');
    });

    it('should handle special characters in string values', () => {
      const index = 'existing';
      const key = 'code';
      const value = 'ABC-123_test@domain.com';

      const result = addIndexElement(index, key, value);

      expect(result).toBe('existing code:ABC-123_test@domain.com');
    });

    it('should handle multiple consecutive calls', () => {
      let index = '';
      
      index = addIndexElement(index, 'name', 'test');
      expect(index).toBe(' name:test');
      
      index = addIndexElement(index, 'category', 'important');
      expect(index).toBe(' name:test category:important');
      
      index = addIndexElement(index, 'count', 5);
      expect(index).toBe(' name:test category:important count:5');
    });
  });
});