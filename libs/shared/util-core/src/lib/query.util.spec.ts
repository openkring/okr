import { DbQuery } from '@bk2/shared-models';
import { describe, expect, it } from 'vitest';
import {
  addSystemQueries,
  getRangeQuery,
  getSystemQuery
} from './query.util';

describe('query.util', () => {
  describe('getRangeQuery', () => {
    it('should create a range query with default isArchived=false', () => {
      const result = getRangeQuery('createdAt', 100, 200);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'createdAt', operator: '>=', value: 100 },
        { key: 'createdAt', operator: '<=', value: 200 }
      ]);
    });

    it('should create a range query with isArchived=true', () => {
      const result = getRangeQuery('timestamp', 1000, 2000, true);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: true },
        { key: 'timestamp', operator: '>=', value: 1000 },
        { key: 'timestamp', operator: '<=', value: 2000 }
      ]);
    });

    it('should handle string values for range bounds', () => {
      const result = getRangeQuery('name', 'apple', 'zebra');

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'name', operator: '>=', value: 'apple' },
        { key: 'name', operator: '<=', value: 'zebra' }
      ]);
    });

    it('should handle mixed number and string values', () => {
      const result = getRangeQuery('id', '100', 200);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'id', operator: '>=', value: '100' },
        { key: 'id', operator: '<=', value: 200 }
      ]);
    });

    it('should handle equal low and high values', () => {
      const result = getRangeQuery('score', 50, 50);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'score', operator: '>=', value: 50 },
        { key: 'score', operator: '<=', value: 50 }
      ]);
    });

    it('should handle zero values', () => {
      const result = getRangeQuery('count', 0, 10);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'count', operator: '>=', value: 0 },
        { key: 'count', operator: '<=', value: 10 }
      ]);
    });

    it('should handle negative values', () => {
      const result = getRangeQuery('temperature', -10, 5);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'temperature', operator: '>=', value: -10 },
        { key: 'temperature', operator: '<=', value: 5 }
      ]);
    });

    it('should handle empty string key', () => {
      const result = getRangeQuery('', 1, 2);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: '', operator: '>=', value: 1 },
        { key: '', operator: '<=', value: 2 }
      ]);
    });

    it('should handle empty string values', () => {
      const result = getRangeQuery('text', '', 'zzz');

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'text', operator: '>=', value: '' },
        { key: 'text', operator: '<=', value: 'zzz' }
      ]);
    });

    it('should maintain correct DbQuery structure', () => {
      const result = getRangeQuery('field', 1, 10);

      result.forEach(query => {
        expect(query).toHaveProperty('key');
        expect(query).toHaveProperty('operator');
        expect(query).toHaveProperty('value');
        expect(typeof query.key).toBe('string');
        expect(typeof query.operator).toBe('string');
      });
    });
  });

  describe('getSystemQuery', () => {
    it('should create a system query for a given tenant', () => {
      const tenant = 'company-123';
      const result = getSystemQuery(tenant);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: 'company-123' }
      ]);
    });

    it('should handle empty tenant string', () => {
      const result = getSystemQuery('');

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: '' }
      ]);
    });

    it('should handle tenant with special characters', () => {
      const tenant = 'tenant-with-$pecial_chars@domain.com';
      const result = getSystemQuery(tenant);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: tenant }
      ]);
    });

    it('should handle numeric tenant (converted to string)', () => {
      const tenant = '12345';
      const result = getSystemQuery(tenant);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: '12345' }
      ]);
    });

    it('should handle very long tenant names', () => {
      const tenant = 'a'.repeat(100);
      const result = getSystemQuery(tenant);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: tenant }
      ]);
    });

    it('should maintain correct DbQuery structure', () => {
      const result = getSystemQuery('test-tenant');

      expect(result).toHaveLength(2);
      result.forEach(query => {
        expect(query).toHaveProperty('key');
        expect(query).toHaveProperty('operator');
        expect(query).toHaveProperty('value');
        expect(typeof query.key).toBe('string');
        expect(typeof query.operator).toBe('string');
      });
    });

    it('should always use array-contains operator for tenants', () => {
      const result = getSystemQuery('any-tenant');
      const tenantQuery = result.find(q => q.key === 'tenants');

      expect(tenantQuery?.operator).toBe('array-contains');
    });

    it('should always set isArchived to false', () => {
      const result = getSystemQuery('any-tenant');
      const archivedQuery = result.find(q => q.key === 'isArchived');

      expect(archivedQuery?.operator).toBe('==');
      expect(archivedQuery?.value).toBe(false);
    });
  });

  describe('addSystemQueries', () => {
    it('should add system queries to existing query array', () => {
      const existingQueries: DbQuery[] = [
        { key: 'status', operator: '==', value: 'active' },
        { key: 'type', operator: '==', value: 'user' }
      ];
      const tenant = 'test-tenant';

      const result = addSystemQueries(existingQueries, tenant);

      expect(result).toEqual([
        { key: 'status', operator: '==', value: 'active' },
        { key: 'type', operator: '==', value: 'user' },
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: 'test-tenant' }
      ]);
    });

    it('should add system queries to empty query array', () => {
      const existingQueries: DbQuery[] = [];
      const tenant = 'empty-test';

      const result = addSystemQueries(existingQueries, tenant);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'tenants', operator: 'array-contains', value: 'empty-test' }
      ]);
    });

    it('should modify the original array and return it', () => {
      const existingQueries: DbQuery[] = [
        { key: 'name', operator: '==', value: 'test' }
      ];
      const tenant = 'modify-test';

      const result = addSystemQueries(existingQueries, tenant);

      // Should return the same reference
      expect(result).toBe(existingQueries);
      // Original array should be modified
      expect(existingQueries).toHaveLength(3);
      expect(existingQueries[1]).toEqual({ key: 'isArchived', operator: '==', value: false });
      expect(existingQueries[2]).toEqual({ key: 'tenants', operator: 'array-contains', value: 'modify-test' });
    });

    it('should handle duplicate system queries gracefully', () => {
      const existingQueries: DbQuery[] = [
        { key: 'isArchived', operator: '==', value: true },
        { key: 'tenants', operator: 'array-contains', value: 'old-tenant' }
      ];
      const tenant = 'new-tenant';

      const result = addSystemQueries(existingQueries, tenant);

      expect(result).toHaveLength(4);
      // Should append new system queries even if similar ones exist
      expect(result[2]).toEqual({ key: 'isArchived', operator: '==', value: false });
      expect(result[3]).toEqual({ key: 'tenants', operator: 'array-contains', value: 'new-tenant' });
    });

    it('should handle complex existing queries', () => {
      const existingQueries: DbQuery[] = [
        { key: 'createdAt', operator: '>=', value: 1000 },
        { key: 'createdAt', operator: '<=', value: 2000 },
        { key: 'status', operator: 'in', value: [0, 3] },
        { key: 'tags', operator: 'array-contains-any', value: [1, 4] }
      ];

      const tenant = 'complex-tenant';

      const result = addSystemQueries(existingQueries, tenant);

      expect(result).toHaveLength(6);
      // Should preserve all existing queries
      expect(result.slice(0, 4)).toEqual(existingQueries.slice(0, 4));
      // Should append system queries
      expect(result[4]).toEqual({ key: 'isArchived', operator: '==', value: false });
      expect(result[5]).toEqual({ key: 'tenants', operator: 'array-contains', value: 'complex-tenant' });
    });

    it('should handle special tenant characters', () => {
      const existingQueries: DbQuery[] = [
        { key: 'id', operator: '==', value: 'test' }
      ];
      const tenant = 'tenant@domain.com';

      const result = addSystemQueries(existingQueries, tenant);

      expect(result[2]).toEqual({ 
        key: 'tenants', 
        operator: 'array-contains', 
        value: 'tenant@domain.com' 
      });
    });
  });

  describe('integration and edge cases', () => {
    it('should work together - range query with system queries', () => {
      const rangeQuery = getRangeQuery('timestamp', 1000, 2000);
      const tenant = 'integration-test';
      
      const result = addSystemQueries(rangeQuery, tenant);

      expect(result).toEqual([
        { key: 'isArchived', operator: '==', value: false },
        { key: 'timestamp', operator: '>=', value: 1000 },
        { key: 'timestamp', operator: '<=', value: 2000 },
        { key: 'isArchived', operator: '==', value: false }, // Duplicate from system query
        { key: 'tenants', operator: 'array-contains', value: 'integration-test' }
      ]);
    });

    it('should handle all functions with edge case values', () => {
      // Test with edge case values
      const rangeQuery = getRangeQuery('', 0, 0, true);
      expect(rangeQuery).toHaveLength(3);

      const systemQuery = getSystemQuery('');
      expect(systemQuery).toHaveLength(2);

      const combinedQuery = addSystemQueries(rangeQuery, '');
      expect(rangeQuery).toHaveLength(5);   // the parameter is changed
      expect(systemQuery).toHaveLength(2);  // ensure it is unchanged
      expect(combinedQuery).toHaveLength(5);
    });

    it('should maintain proper DbQuery interface compliance', () => {
      const rangeQuery = getRangeQuery('test', 1, 10);
      const systemQuery = getSystemQuery('tenant');
      const combinedQuery = addSystemQueries(rangeQuery, 'tenant');

      // Type check - should all be DbQuery[]
      const allQueries: DbQuery[] = [...rangeQuery, ...systemQuery, ...combinedQuery];
      
      allQueries.forEach(query => {
        expect(query).toHaveProperty('key');
        expect(query).toHaveProperty('operator');
        expect(query).toHaveProperty('value');
        expect(typeof query.key).toBe('string');
        expect(typeof query.operator).toBe('string');
      });
    });

    it('should demonstrate typical usage patterns', () => {
      // Typical usage: create range query, then add system constraints
      const dateRangeQuery = getRangeQuery('createdAt', '2024-01-01', '2024-12-31');
      const finalQuery = addSystemQueries(dateRangeQuery, 'company-xyz');

      // Use toContainEqual for deep object comparison instead of toContain
      expect(finalQuery).toContainEqual({ key: 'createdAt', operator: '>=', value: '2024-01-01' });
      expect(finalQuery).toContainEqual({ key: 'createdAt', operator: '<=', value: '2024-12-31' });
      expect(finalQuery).toContainEqual({ key: 'tenants', operator: 'array-contains', value: 'company-xyz' });
      expect(finalQuery.filter(q => q.key === 'isArchived')).toHaveLength(2); // One from range, one from system
    });
  });
});