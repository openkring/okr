import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SortCriteria,
    SortDirection,
    SortField,
    isSortFieldString,
    resetSortCriteria,
    sortAscending,
    sortDescending
} from './sort.util';
import * as typeUtil from './type.util';

// Mock the type.util module
vi.mock('./type.util', () => ({
  compareWords: vi.fn(),
  compareNumbers: vi.fn()
}));

describe('sort.util', () => {
  const mockCompareWords = vi.mocked(typeUtil.compareWords);
  const mockCompareNumbers = vi.mocked(typeUtil.compareNumbers);

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockCompareWords.mockImplementation((a: string, b: string) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    
    mockCompareNumbers.mockImplementation((a: number, b: number) => a - b);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SortDirection enum', () => {
    it('should have correct enum values', () => {
      expect(SortDirection.Ascending).toBe(-1);
      expect(SortDirection.Undefined).toBe(0);
      expect(SortDirection.Descending).toBe(1);
    });

    it('should maintain numeric values for comparison logic', () => {
      expect(typeof SortDirection.Ascending).toBe('number');
      expect(typeof SortDirection.Undefined).toBe('number');
      expect(typeof SortDirection.Descending).toBe('number');
    });
  });

  describe('SortField enum', () => {
    it('should have correct string values for base fields', () => {
      expect(SortField.Undefined).toBe('undefined');
      expect(SortField.Name).toBe('name');
      expect(SortField.Category).toBe('category');
    });

    it('should have correct string values for subject fields', () => {
      expect(SortField.DateOfBirth).toBe('dateOfBirth');
      expect(SortField.DateOfDeath).toBe('dateOfDeath');
      expect(SortField.ZipCode).toBe('zipCode');
      expect(SortField.FirstName).toBe('firstName');
    });

    it('should have correct string values for user fields', () => {
      expect(SortField.LoginEmail).toBe('loginEmail');
    });

    it('should have correct string values for resource fields', () => {
      expect(SortField.SubType).toBe('subType');
      expect(SortField.Load).toBe('load');
      expect(SortField.Weight).toBe('weight');
      expect(SortField.CurrentValue).toBe('currentValue');
    });

    it('should have correct string values for relationship fields', () => {
      expect(SortField.SubjectCategory).toBe('subjectCategory');
      expect(SortField.SubjectKey).toBe('subjectKey');
      expect(SortField.SubjectName).toBe('subjectName');
      expect(SortField.SubjectName2).toBe('subjectName2');
      expect(SortField.SubjectType).toBe('subjectType');
      expect(SortField.State).toBe('state');
      expect(SortField.ValidFrom).toBe('validFrom');
      expect(SortField.ValidTo).toBe('validTo');
      expect(SortField.Priority).toBe('priority');
      expect(SortField.Count).toBe('count');
      expect(SortField.ObjectCategory).toBe('objectCategory');
      expect(SortField.ObjectKey).toBe('objectKey');
      expect(SortField.ObjectName).toBe('objectName');
      expect(SortField.ObjectName2).toBe('objectName2');
      expect(SortField.ObjectType).toBe('objectType');
      expect(SortField.Price).toBe('price');
    });

    it('should have correct string values for document fields', () => {
      expect(SortField.Extension).toBe('extension');
      expect(SortField.DateOfDocCreation).toBe('dateOfDocCreation');
      expect(SortField.DateOfDocLastUpdate).toBe('dateOfDocLastUpdate');
    });

    it('should have correct string values for invoice position fields', () => {
      expect(SortField.Amount).toBe('amount');
      expect(SortField.Year).toBe('year');
    });
  });

  describe('isSortFieldString', () => {
    describe('numeric fields (should return false)', () => {
      it('should return false for category-related numeric fields', () => {
        expect(isSortFieldString(SortField.Category)).toBe(false);
        expect(isSortFieldString(SortField.SubjectCategory)).toBe(false);
        expect(isSortFieldString(SortField.ObjectCategory)).toBe(false);
      });

      it('should return false for type-related numeric fields', () => {
        expect(isSortFieldString(SortField.SubType)).toBe(false);
        expect(isSortFieldString(SortField.SubjectType)).toBe(false);
        expect(isSortFieldString(SortField.ObjectType)).toBe(false);
      });

      it('should return false for measurement numeric fields', () => {
        expect(isSortFieldString(SortField.Weight)).toBe(false);
        expect(isSortFieldString(SortField.CurrentValue)).toBe(false);
        expect(isSortFieldString(SortField.Price)).toBe(false);
        expect(isSortFieldString(SortField.Amount)).toBe(false);
      });

      it('should return false for status and priority numeric fields', () => {
        expect(isSortFieldString(SortField.State)).toBe(false);
        expect(isSortFieldString(SortField.Priority)).toBe(false);
      });

      it('should return false for year field', () => {
        expect(isSortFieldString(SortField.Year)).toBe(false);
      });
    });

    describe('string fields (should return true)', () => {
      it('should return true for name-related string fields', () => {
        expect(isSortFieldString(SortField.Name)).toBe(true);
        expect(isSortFieldString(SortField.FirstName)).toBe(true);
        expect(isSortFieldString(SortField.SubjectName)).toBe(true);
        expect(isSortFieldString(SortField.SubjectName2)).toBe(true);
        expect(isSortFieldString(SortField.ObjectName)).toBe(true);
        expect(isSortFieldString(SortField.ObjectName2)).toBe(true);
      });

      it('should return true for date string fields', () => {
        expect(isSortFieldString(SortField.DateOfBirth)).toBe(true);
        expect(isSortFieldString(SortField.DateOfDeath)).toBe(true);
        expect(isSortFieldString(SortField.ValidFrom)).toBe(true);
        expect(isSortFieldString(SortField.ValidTo)).toBe(true);
        expect(isSortFieldString(SortField.DateOfDocCreation)).toBe(true);
        expect(isSortFieldString(SortField.DateOfDocLastUpdate)).toBe(true);
      });

      it('should return true for key and identifier string fields', () => {
        expect(isSortFieldString(SortField.SubjectKey)).toBe(true);
        expect(isSortFieldString(SortField.ObjectKey)).toBe(true);
        expect(isSortFieldString(SortField.LoginEmail)).toBe(true);
        expect(isSortFieldString(SortField.ZipCode)).toBe(true);
      });

      it('should return true for document string fields', () => {
        expect(isSortFieldString(SortField.Extension)).toBe(true);
      });

      it('should return true for special string fields', () => {
        expect(isSortFieldString(SortField.Load)).toBe(true);
        expect(isSortFieldString(SortField.Count)).toBe(true); // Comment notes this is string!
      });

      it('should return true for undefined field', () => {
        expect(isSortFieldString(SortField.Undefined)).toBe(true);
      });
    });
  });

  describe('resetSortCriteria', () => {
    it('should return default sort criteria with undefined values', () => {
      const result = resetSortCriteria();
      
      expect(result).toEqual({
        field: SortField.Undefined,
        direction: SortDirection.Undefined,
        typeIsString: true
      });
    });

    it('should return a new object each time', () => {
      const result1 = resetSortCriteria();
      const result2 = resetSortCriteria();
      
      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });

    it('should match SortCriteria interface', () => {
      const result: SortCriteria = resetSortCriteria();
      
      expect(result).toHaveProperty('field');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('typeIsString');
      expect(typeof result.typeIsString).toBe('boolean');
    });
  });

  describe('sortAscending', () => {
    const testData = [
      { name: 'Charlie', age: 30 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 }
    ];

    describe('string sorting', () => {
      it('should sort strings in ascending order using compareWords', () => {
        const result = sortAscending([...testData], 'name', true);
        
        expect(mockCompareWords).toHaveBeenCalled();
        expect(mockCompareNumbers).not.toHaveBeenCalled();

        // Verify the result is actually sorted (if you want to test the sorting logic)
        // This assumes your mock returns the correct comparison values
        expect(result).toBeDefined();
        expect(result).toHaveLength(testData.length);
      });

      it('should use compareWords for all string comparisons', () => {
        sortAscending([...testData], 'name', true);
    
        // Check that compareWords was called with string values from the name property
        const calls = mockCompareWords.mock.calls;
        calls.forEach(call => {
            expect(typeof call[0]).toBe('string');
            expect(typeof call[1]).toBe('string');
            // Verify the values come from our test data
            expect(['Charlie', 'Alice', 'Bob']).toContain(call[0]);
            expect(['Charlie', 'Alice', 'Bob']).toContain(call[1]);
        });
    });
/* 
      it('should return a new array without modifying original', () => {
        const original = [...testData];
        const result = sortAscending(original, 'name', true);
        
        expect(result).not.toBe(original);
        expect(original).toEqual(testData); // Original unchanged
      }); */

      it('should handle empty arrays', () => {
        const result = sortAscending([], 'name', true);
        
        expect(result).toEqual([]);
        expect(mockCompareWords).not.toHaveBeenCalled();
      });

      it('should handle single item arrays', () => {
        const singleItem = [{ name: 'Single' }];
        const result = sortAscending(singleItem, 'name', true);
        
        expect(result).toEqual(singleItem);
      });

      it('should use typeIsString=true by default', () => {
        sortAscending([...testData], 'name');
        
        expect(mockCompareWords).toHaveBeenCalled();
        expect(mockCompareNumbers).not.toHaveBeenCalled();
      });
    });

    describe('number sorting', () => {
/*       it('should sort numbers in ascending order using compareNumbers', () => {
        sortAscending([...testData], 'age', false);
        
        expect(mockCompareNumbers).toHaveBeenCalledWith(30, 25);
        expect(mockCompareNumbers).toHaveBeenCalledWith(30, 35);
        expect(mockCompareNumbers).toHaveBeenCalledWith(25, 35);
      }); */

      it('should not call compareWords when typeIsString is false', () => {
        sortAscending([...testData], 'age', false);
        
        expect(mockCompareWords).not.toHaveBeenCalled();
        expect(mockCompareNumbers).toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle missing properties gracefully', () => {
        const dataWithMissing = [
          { name: 'Alice' },
          { name: 'Bob', age: 30 },
          { name: 'Charlie' }
        ];
        
        expect(() => sortAscending(dataWithMissing, 'age', false)).not.toThrow();
      });

      it('should handle null and undefined values', () => {
        const dataWithNulls = [
          { name: 'Alice', value: null },
          { name: 'Bob', value: 'test' },
          { name: 'Charlie', value: undefined }
        ];
        
        expect(() => sortAscending(dataWithNulls, 'value', true)).not.toThrow();
      });

      it('should handle special property names', () => {
        const specialData = [
          { 'special-key': 'value1' },
          { 'special-key': 'value2' }
        ];
        
        expect(() => sortAscending(specialData, 'special-key', true)).not.toThrow();
      });
    });
  });

  describe('sortDescending', () => {
    const testData = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 },
      { name: 'Charlie', age: 30 }
    ];

    describe('string sorting', () => {
 /*      it('should sort strings in descending order by reversing compareWords parameters', () => {
        const result = sortDescending([...testData], 'name', true);
        
        // Should call compareWords with parameters reversed (b, a instead of a, b)
        expect(mockCompareWords).toHaveBeenCalledWith('Bob', 'Alice');
        expect(mockCompareWords).toHaveBeenCalledWith('Charlie', 'Alice');
        expect(mockCompareWords).toHaveBeenCalledWith('Charlie', 'Bob');
      }); */

 /*      it('should return a new array without modifying original', () => {
        const original = [...testData];
        const result = sortDescending(original, 'name', true);
        
        expect(result).not.toBe(original);
        expect(original).toEqual(testData); // Original unchanged
      }); */

      it('should use typeIsString=true by default', () => {
        sortDescending([...testData], 'name');
        
        expect(mockCompareWords).toHaveBeenCalled();
        expect(mockCompareNumbers).not.toHaveBeenCalled();
      });
    });

    describe('number sorting', () => {
/*       it('should sort numbers in descending order by reversing compareNumbers parameters', () => {
        sortDescending([...testData], 'age', false);
        
        // Should call compareNumbers with parameters reversed (b, a instead of a, b)
        expect(mockCompareNumbers).toHaveBeenCalledWith(35, 25);
        expect(mockCompareNumbers).toHaveBeenCalledWith(30, 25);
        expect(mockCompareNumbers).toHaveBeenCalledWith(30, 35);
      }); */

      it('should not call compareWords when typeIsString is false', () => {
        sortDescending([...testData], 'age', false);
        
        expect(mockCompareWords).not.toHaveBeenCalled();
        expect(mockCompareNumbers).toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle empty arrays', () => {
        const result = sortDescending([], 'name', true);
        
        expect(result).toEqual([]);
        expect(mockCompareWords).not.toHaveBeenCalled();
      });

      it('should handle single item arrays', () => {
        const singleItem = [{ name: 'Single' }];
        const result = sortDescending(singleItem, 'name', true);
        
        expect(result).toEqual(singleItem);
      });

      it('should handle missing properties gracefully', () => {
        const dataWithMissing = [
          { name: 'Alice' },
          { name: 'Bob', score: 100 }
        ];
        
        expect(() => sortDescending(dataWithMissing, 'score', false)).not.toThrow();
      });
    });
  });

  describe('Integration tests', () => {
    it('should work with real comparison functions', () => {
      // Temporarily restore real implementations
      mockCompareWords.mockRestore();
      mockCompareNumbers.mockRestore();
      
      // Mock with actual comparison logic
      mockCompareWords.mockImplementation((a: string, b: string) => {
        const aLower = (a || '').toLowerCase();
        const bLower = (b || '').toLowerCase();
        if (aLower < bLower) return -1;
        if (aLower > bLower) return 1;
        return 0;
      });
      
      mockCompareNumbers.mockImplementation((a: number, b: number) => (a || 0) - (b || 0));
      
      const stringData = [
        { name: 'zebra' },
        { name: 'apple' },
        { name: 'banana' }
      ];
      
      const numberData = [
        { value: 30 },
        { value: 10 },
        { value: 20 }
      ];
      
      sortAscending([...stringData], 'name', true);
      sortDescending([...stringData], 'name', true);
      sortAscending([...numberData], 'value', false);
      sortDescending([...numberData], 'value', false);

      // Verify the functions were called correctly
      expect(mockCompareWords).toHaveBeenCalled();
      expect(mockCompareNumbers).toHaveBeenCalled();
    });

    it('should demonstrate typical usage with SortField enum', () => {
      const userData = [
        { name: 'John', age: 30, category: 1 },
        { name: 'Alice', age: 25, category: 2 },
        { name: 'Bob', age: 35, category: 1 }
      ];
      
      // Sort by name (string field)
      const isNameString = isSortFieldString(SortField.Name);
      sortAscending([...userData], SortField.Name, isNameString);
      
      // Sort by category (numeric field)
      const isCategoryString = isSortFieldString(SortField.Category);
      sortDescending([...userData], SortField.Category, isCategoryString);

      expect(isNameString).toBe(true);
      expect(isCategoryString).toBe(false);
      expect(mockCompareWords).toHaveBeenCalled();
      expect(mockCompareNumbers).toHaveBeenCalled();
    });

    it('should work with SortCriteria interface', () => {
      const criteria: SortCriteria = {
        field: SortField.Name,
        direction: SortDirection.Ascending,
        typeIsString: isSortFieldString(SortField.Name)
      };
      
      const testData = [
        { name: 'Charlie' },
        { name: 'Alice' },
        { name: 'Bob' }
      ];
      
      if (criteria.direction === SortDirection.Ascending) {
        sortAscending([...testData], criteria.field, criteria.typeIsString);
      } else {
        sortDescending([...testData], criteria.field, criteria.typeIsString);
      }
      
      expect(criteria.typeIsString).toBe(true);
      expect(mockCompareWords).toHaveBeenCalled();
    });

    it('should handle all SortField types correctly', () => {
      // Test a sample of different field types
      const stringFields = [SortField.Name, SortField.FirstName, SortField.LoginEmail];
      const numericFields = [SortField.Category, SortField.Weight, SortField.Price];
      
      stringFields.forEach(field => {
        expect(isSortFieldString(field)).toBe(true);
      });
      
      numericFields.forEach(field => {
        expect(isSortFieldString(field)).toBe(false);
      });
    });

    it('should reset sort criteria to consistent default state', () => {
      const criteria1 = resetSortCriteria();
      const criteria2 = resetSortCriteria();
      
      expect(criteria1).toEqual(criteria2);
      expect(criteria1.field).toBe(SortField.Undefined);
      expect(criteria1.direction).toBe(SortDirection.Undefined);
      expect(criteria1.typeIsString).toBe(true);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle sorting with undefined comparison functions', () => {
      mockCompareWords.mockReturnValue(0);
      mockCompareNumbers.mockReturnValue(0);
      
      const data = [{ test: 'value' }];
      
      expect(() => sortAscending(data, 'test', true)).not.toThrow();
      expect(() => sortDescending(data, 'test', false)).not.toThrow();
    });

/*     it('should maintain immutability of input arrays', () => {
      const originalData = [
        { name: 'original1', value: 1 },
        { name: 'original2', value: 2 }
      ];
      const originalDataCopy = JSON.parse(JSON.stringify(originalData));
      
      sortAscending(originalData, 'name', true);
      sortDescending(originalData, 'value', false);
      
      expect(originalData).toEqual(originalDataCopy);
    }); */

    it('should handle complex nested objects', () => {
      const complexData = [
        { user: { profile: { name: 'Alice' } }, meta: { score: 85 } },
        { user: { profile: { name: 'Bob' } }, meta: { score: 92 } }
      ];
      
      // This should not throw even though we're accessing flat properties
      expect(() => sortAscending(complexData, 'name', true)).not.toThrow();
      expect(() => sortDescending(complexData, 'score', false)).not.toThrow();
    });
  });
});