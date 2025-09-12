import { orderBy, where } from 'firebase/firestore';
import { of } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BkModel, DbQuery, UserModel } from '@bk2/shared-models';
import * as logUtil from './log.util';
import {
  findAllByField,
  findByField,
  findByKey,
  findUserByPersonKey,
  getQuery
} from './search.util';

// Mock Firebase Firestore
vi.mock('firebase/firestore', () => ({
  where: vi.fn(),
  orderBy: vi.fn(),
}));

// Mock the log.util module
vi.mock('./log.util', () => ({
  warn: vi.fn()
}));

describe('search.util', () => {
  const mockWhere = vi.mocked(where);
  const mockOrderBy = vi.mocked(orderBy);
  const mockWarn = vi.mocked(logUtil.warn);

  let testScheduler: TestScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock implementations
    mockWhere.mockImplementation((field, operator, value) => 
      ({ field, operator, value, type: 'where' } as any)
    );
    mockOrderBy.mockImplementation((field, direction) => 
      ({ field, direction, type: 'orderBy' } as any)
    );

    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getQuery', () => {
    const sampleDbQuery: DbQuery[] = [
      { key: 'name', operator: '==', value: 'John' },
      { key: 'age', operator: '>=', value: 18 },
      { key: 'city', operator: '==', value: 'NYC' }
    ];

    it('should convert DbQuery array to QueryConstraints with default ordering', () => {
      const result = getQuery(sampleDbQuery);

      expect(mockWhere).toHaveBeenCalledTimes(3);
      expect(mockWhere).toHaveBeenCalledWith('name', '==', 'John');
      expect(mockWhere).toHaveBeenCalledWith('age', '>=', 18);
      expect(mockWhere).toHaveBeenCalledWith('city', '==', 'NYC');
      
      expect(mockOrderBy).toHaveBeenCalledTimes(1);
      expect(mockOrderBy).toHaveBeenCalledWith('name', 'asc');
      
      expect(result).toHaveLength(4); // 3 where + 1 orderBy
    });

    it('should use custom orderBy parameter', () => {
      const result = getQuery(sampleDbQuery, 'createdAt');

      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'asc');
      expect(result).toHaveLength(4);
    });

    it('should use custom sort order parameter', () => {
      const result = getQuery(sampleDbQuery, 'name', 'desc');

      expect(mockOrderBy).toHaveBeenCalledWith('name', 'desc');
      expect(result).toHaveLength(4);
    });

    it('should use both custom orderBy and sort order parameters', () => {
      const result = getQuery(sampleDbQuery, 'timestamp', 'desc');

      expect(mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(result).toHaveLength(4);
    });

    it('should handle empty DbQuery array', () => {
      const result = getQuery([]);

      expect(mockWhere).not.toHaveBeenCalled();
      expect(mockOrderBy).toHaveBeenCalledTimes(1);
      expect(mockOrderBy).toHaveBeenCalledWith('name', 'asc');
      expect(result).toHaveLength(1); // Only orderBy
    });

    it('should handle single DbQuery', () => {
      const singleQuery: DbQuery[] = [
        { key: 'status', operator: '==', value: 'active' }
      ];

      const result = getQuery(singleQuery);

      expect(mockWhere).toHaveBeenCalledTimes(1);
      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'active');
      expect(mockOrderBy).toHaveBeenCalledWith('name', 'asc');
      expect(result).toHaveLength(2);
    });

    it('should handle various operators', () => {
      const queryWithDifferentOps: DbQuery[] = [
        { key: 'count', operator: '>', value: 0 },
        { key: 'tags', operator: 'array-contains', value: 'important' },
        { key: 'price', operator: '<=', value: 100 },
        { key: 'categories', operator: 'in', value: [0, 3] }
      ];

      const result = getQuery(queryWithDifferentOps);

      expect(mockWhere).toHaveBeenCalledWith('count', '>', 0);
      expect(mockWhere).toHaveBeenCalledWith('tags', 'array-contains', 'important');
      expect(mockWhere).toHaveBeenCalledWith('price', '<=', 100);
      expect(mockWhere).toHaveBeenCalledWith('categories', 'in', [0, 3]);
      expect(result).toHaveLength(5);
    });

    it('should handle various value types', () => {
      const queryWithDifferentValues: DbQuery[] = [
        { key: 'name', operator: '==', value: 'string' },
        { key: 'age', operator: '==', value: 25 },
        { key: 'active', operator: '==', value: true }
      ];

      const result = getQuery(queryWithDifferentValues);

      expect(mockWhere).toHaveBeenCalledWith('name', '==', 'string');
      expect(mockWhere).toHaveBeenCalledWith('age', '==', 25);
      expect(mockWhere).toHaveBeenCalledWith('active', '==', true);
      expect(result).toHaveLength(4);
    });
  });

  describe('findByKey', () => {
    interface TestModel extends BkModel {
      bkey: string;
      name: string;
    }

    const testModels: TestModel[] = [
      { bkey: 'key1', name: 'Model 1' } as TestModel,
      { bkey: 'key2', name: 'Model 2' } as TestModel,
      { bkey: 'key3', name: 'Model 3' } as TestModel
    ];

    it('should find model by existing key', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testModels });
        const result$ = findByKey(items$, 'key2');

        expectObservable(result$).toBe('a|', { 
          a: testModels[1] 
        });
      });
    });

    it('should return undefined for non-existing key', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testModels });
        const result$ = findByKey(items$, 'nonexistent');

        expectObservable(result$).toBe('a|', { 
          a: undefined 
        });
      });
    });

    it('should warn and return undefined for null key', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testModels);
        const result$ = findByKey(items$, null);

        expectObservable(result$).toBe('(a|)', { 
          a: undefined 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findByKey: invalid key <null>');
    });

    it('should warn and return undefined for undefined key', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testModels);
        const result$ = findByKey(items$, undefined);

        expectObservable(result$).toBe('(a|)', { 
          a: undefined 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findByKey: invalid key <undefined>');
    });

    it('should warn and return undefined for empty string key', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testModels);
        const result$ = findByKey(items$, '');

        expectObservable(result$).toBe('(a|)', { 
          a: undefined 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findByKey: invalid key <>');
    });

    it('should handle empty array', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: [] });
        const result$ = findByKey(items$, 'key1');

        expectObservable(result$).toBe('a|', { 
          a: undefined 
        });
      });
    });

    it('should find first matching item when duplicates exist', () => {
      const duplicateModels: TestModel[] = [
        { bkey: 'key1', name: 'First Model 1' } as TestModel,
        { bkey: 'key2', name: 'Model 2' } as TestModel,
        { bkey: 'key1', name: 'Second Model 1' } as TestModel
      ];

      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: duplicateModels });
        const result$ = findByKey(items$, 'key1');

        expectObservable(result$).toBe('a|', { 
          a: duplicateModels[0] 
        });
      });
    });

    it('should work with multiple emissions', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a-b-c|', { 
          a: [testModels[0]], 
          b: [testModels[0], testModels[1]], 
          c: testModels 
        });
        const result$ = findByKey(items$, 'key3');

        expectObservable(result$).toBe('a-b-c|', { 
          a: undefined,
          b: undefined,
          c: testModels[2]
        });
      });
    });
  });

  describe('findUserByPersonKey', () => {
    const testUsers: UserModel[] = [
      { personKey: 'person1', loginEmail: 'user1@test.com' } as UserModel,
      { personKey: 'person2', loginEmail: 'user2@test.com' } as UserModel,
      { personKey: 'person3', loginEmail: 'user3@test.com' } as UserModel
    ];

    it('should find user by existing personKey', () => {
      const result = findUserByPersonKey(testUsers, 'person2');
      expect(result).toEqual(testUsers[1]);
    });

    it('should return undefined for non-existing personKey', () => {
      const result = findUserByPersonKey(testUsers, 'nonexistent');
      expect(result).toBeUndefined();
    });

    it('should warn and return undefined for undefined personKey', () => {
      const result = findUserByPersonKey(testUsers, undefined);
      
      expect(result).toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith('search.util.findUserByPersonKey: personKey is mandatory.');
    });

    it('should warn and return undefined for empty string personKey', () => {
      const result = findUserByPersonKey(testUsers, '');
      
      expect(result).toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith('search.util.findUserByPersonKey: personKey is mandatory.');
    });

    it('should handle empty user array', () => {
      const result = findUserByPersonKey([], 'person1');
      expect(result).toBeUndefined();
    });

    it('should find first matching user when duplicates exist', () => {
      const duplicateUsers: UserModel[] = [
        { personKey: 'person1', loginEmail: 'first@test.com' } as UserModel,
        { personKey: 'person2', loginEmail: 'user2@test.com' } as UserModel,
        { personKey: 'person1', loginEmail: 'second@test.com' } as UserModel
      ];

      const result = findUserByPersonKey(duplicateUsers, 'person1');
      expect(result).toEqual(duplicateUsers[0]);
    });

    it('should handle users with null personKey', () => {
      const usersWithNull: UserModel[] = [
        { personKey: null, loginEmail: 'null@test.com' } as any,
        { personKey: 'person1', loginEmail: 'valid@test.com' } as UserModel
      ];

      const result = findUserByPersonKey(usersWithNull, 'person1');
      expect(result).toEqual(usersWithNull[1]);
    });
  });

  describe('findByField', () => {
    interface TestItem {
      id: string;
      name: string;
      category: string;
      active: boolean;
    }

    const testItems: TestItem[] = [
      { id: '1', name: 'Item 1', category: 'A', active: true },
      { id: '2', name: 'Item 2', category: 'B', active: false },
      { id: '3', name: 'Item 3', category: 'A', active: true }
    ];

    it('should find item by field and value', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findByField(items$, 'category', 'B');

        expectObservable(result$).toBe('a|', { 
          a: testItems[1] 
        });
      });
    });

    it('should return undefined for non-existing field value', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findByField(items$, 'category', 'C');

        expectObservable(result$).toBe('a|', { 
          a: undefined 
        });
      });
    });

    it('should warn and return undefined for invalid fieldName', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testItems);
        const result$ = findByField(items$, null, 'value');

        expectObservable(result$).toBe('(a|)', { 
          a: undefined 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findByField: invalid fieldName>');
    });

    it('should warn and return undefined for empty fieldName', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testItems);
        const result$ = findByField(items$, '', 'value');

        expectObservable(result$).toBe('(a|)', { 
          a: undefined 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findByField: invalid fieldName>');
    });

    it('should find first matching item when duplicates exist', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findByField(items$, 'category', 'A');

        expectObservable(result$).toBe('a|', { 
          a: testItems[0] // First item with category 'A'
        });
      });
    });

    it('should handle null and undefined values', () => {
      const itemsWithNulls: TestItem[] = [
        { id: '1', name: 'Item 1', category: null as any, active: true },
        { id: '2', name: 'Item 2', category: 'B', active: false }
      ];

      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: itemsWithNulls });
        const result$ = findByField(items$, 'category', null);

        expectObservable(result$).toBe('a|', { 
          a: itemsWithNulls[0] 
        });
      });
    });

    it('should handle non-existing field names gracefully', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findByField(items$, 'nonExistentField', 'value');

        expectObservable(result$).toBe('a|', { 
          a: undefined 
        });
      });
    });
  });

  describe('findAllByField', () => {
    interface TestItem {
      id: string;
      name: string;
      category: string;
      active: boolean;
    }

    const testItems: TestItem[] = [
      { id: '1', name: 'Item 1', category: 'A', active: true },
      { id: '2', name: 'Item 2', category: 'B', active: false },
      { id: '3', name: 'Item 3', category: 'A', active: true },
      { id: '4', name: 'Item 4', category: 'A', active: false }
    ];

    it('should find all items by field and value', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findAllByField(items$, 'category', 'A');

        expectObservable(result$).toBe('a|', { 
          a: [testItems[0], testItems[2], testItems[3]]
        });
      });
    });

    it('should return empty array for non-existing field value', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findAllByField(items$, 'category', 'C');

        expectObservable(result$).toBe('a|', { 
          a: [] 
        });
      });
    });

    it('should warn and return empty array for invalid fieldName', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testItems);
        const result$ = findAllByField(items$, null, 'value');

        expectObservable(result$).toBe('(a|)', { 
          a: [] 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findAllByField: invalid fieldName>');
    });

    it('should warn and return empty array for empty fieldName', () => {
      testScheduler.run(({ expectObservable }) => {
        const items$ = of(testItems);
        const result$ = findAllByField(items$, '', 'value');

        expectObservable(result$).toBe('(a|)', { 
          a: [] 
        });
      });

      expect(mockWarn).toHaveBeenCalledWith('search.util.findAllByField: invalid fieldName>');
    });

    it('should handle single matching item', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findAllByField(items$, 'category', 'B');

        expectObservable(result$).toBe('a|', { 
          a: [testItems[1]]
        });
      });
    });

    it('should handle empty array', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: [] });
        const result$ = findAllByField(items$, 'category', 'A');

        expectObservable(result$).toBe('a|', { 
          a: [] 
        });
      });
    });

    it('should handle null and undefined values', () => {
      const itemsWithNulls: TestItem[] = [
        { id: '1', name: 'Item 1', category: null as any, active: true },
        { id: '2', name: 'Item 2', category: 'B', active: false },
        { id: '3', name: 'Item 3', category: null as any, active: true }
      ];

      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: itemsWithNulls });
        const result$ = findAllByField(items$, 'category', null);

        expectObservable(result$).toBe('a|', { 
          a: [itemsWithNulls[0], itemsWithNulls[2]]
        });
      });
    });

    it('should handle non-existing field names gracefully', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a|', { a: testItems });
        const result$ = findAllByField(items$, 'nonExistentField', 'value');

        expectObservable(result$).toBe('a|', { 
          a: [] 
        });
      });
    });

    it('should work with multiple emissions', () => {
      testScheduler.run(({ cold, expectObservable }) => {
        const items$ = cold('a-b-c|', { 
          a: [testItems[0]], 
          b: [testItems[0], testItems[1]], 
          c: testItems 
        });
        const result$ = findAllByField(items$, 'category', 'A');

        expectObservable(result$).toBe('a-b-c|', { 
          a: [testItems[0]],
          b: [testItems[0]],
          c: [testItems[0], testItems[2], testItems[3]]
        });
      });
    });
  });

  describe('Integration and edge cases', () => {
    it('should work together - getQuery with findByKey workflow', () => {
      const dbQuery: DbQuery[] = [
        { key: 'category', operator: '==', value: 'test' }
      ];

      // Create query constraints
      const constraints = getQuery(dbQuery, 'name', 'asc');
      
      // Verify query creation
      expect(mockWhere).toHaveBeenCalledWith('category', '==', 'test');
      expect(mockOrderBy).toHaveBeenCalledWith('name', 'asc');
      expect(constraints).toHaveLength(2);

      // Then use findByKey on results
      const mockResults: BkModel[] = [
        { bkey: 'result1', name: 'Test Item' } as unknown as BkModel
      ];

      testScheduler.run(({ cold, expectObservable }) => {
        const results$ = cold('a|', { a: mockResults });
        const found$ = findByKey(results$, 'result1');

        expectObservable(found$).toBe('a|', { 
          a: mockResults[0] 
        });
      });
    });

    it('should handle complex search scenarios', () => {
      const complexQuery: DbQuery[] = [
        { key: 'tenants', operator: 'array-contains', value: 'tenant-123' },
        { key: 'isArchived', operator: '==', value: false },
        { key: 'createdAt', operator: '>=', value: '2024-01-01' }
      ];

      const constraints = getQuery(complexQuery, 'createdAt', 'desc');

      expect(mockWhere).toHaveBeenCalledTimes(3);
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(constraints).toHaveLength(4);
    });

    it('should demonstrate typical service usage pattern', () => {
      // Simulate service workflow
      interface ServiceModel extends BkModel {
        bkey: string;
        name: string;
        category: string;
      }

      const serviceData: ServiceModel[] = [
        { bkey: 'item1', name: 'Service Item 1', category: 'A' } as ServiceModel,
        { bkey: 'item2', name: 'Service Item 2', category: 'B' } as ServiceModel
      ];

      testScheduler.run(({ cold, expectObservable }) => {
        // Simulate list() function result
        const list$ = cold('a|', { a: serviceData });
        
        // Simulate read() function using findByKey
        const read$ = findByKey(list$, 'item1');
        
        // Simulate filtering by category
        const filtered$ = findAllByField(list$, 'category', 'A');

        expectObservable(read$).toBe('a|', { a: serviceData[0] });
        expectObservable(filtered$).toBe('a|', { a: [serviceData[0]] });
      });
    });

    it('should handle all functions with edge case values', () => {
      // Test query generation with edge cases
      const edgeQuery: DbQuery[] = [
        { key: '', operator: '==', value: '' },
        { key: 'field', operator: '!=', value: '' }
      ];

      expect(() => getQuery(edgeQuery)).not.toThrow();

      // Test search functions with edge cases
      testScheduler.run(({ expectObservable }) => {
        const emptyItems$ = of([]);
        
        const findResult$ = findByKey(emptyItems$, 'missing');
        const fieldResult$ = findByField(emptyItems$, 'field', 'value');
        const allResult$ = findAllByField(emptyItems$, 'field', 'value');

        expectObservable(findResult$).toBe('(a|)', { a: undefined });
        expectObservable(fieldResult$).toBe('(a|)', { a: undefined });
        expectObservable(allResult$).toBe('(a|)', { a: [] });
      });

      // Test user search with edge cases
      expect(findUserByPersonKey([], '')).toBeUndefined();
    });
  });
});