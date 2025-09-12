import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from 'firebase-admin/firestore';
import { searchData } from './search.util';
import { DbQuery } from '@bk2/shared-models';

// Mock the Firestore methods
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockGet = vi.fn();
const mockCollection = vi.fn(() => ({
  where: mockWhere,
  orderBy: mockOrderBy,
  get: mockGet,
}));

// Mock the Firestore instance
const mockFirestore = {
  collection: mockCollection,
} as unknown as Firestore;

describe('searchData', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset the chainable mocks to return 'this' for chaining
    mockWhere.mockReturnThis();
    mockOrderBy.mockReturnThis();
  });

  it('should build a query with a single where clause', async () => {
    const dbQuery: DbQuery[] = [{ key: 'name', operator: '==', value: 'test' }];
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    await searchData(mockFirestore, 'test-collection', dbQuery);

    expect(mockCollection).toHaveBeenCalledWith('test-collection');
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledWith('name', '==', 'test');
  });

  it('should build a query with multiple where clauses', async () => {
    const dbQuery: DbQuery[] = [
      { key: 'name', operator: '==', value: 'test' },
      { key: 'status', operator: '!=', value: 'archived' },
    ];
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    await searchData(mockFirestore, 'test-collection', dbQuery);

    expect(mockWhere).toHaveBeenCalledTimes(2);
    expect(mockWhere).toHaveBeenCalledWith('name', '==', 'test');
    expect(mockWhere).toHaveBeenCalledWith('status', '!=', 'archived');
  });

  it('should use the default orderBy parameter', async () => {
    const dbQuery: DbQuery[] = [];
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    await searchData(mockFirestore, 'test-collection', dbQuery);

    expect(mockOrderBy).toHaveBeenCalledTimes(1);
    expect(mockOrderBy).toHaveBeenCalledWith('name', 'asc');
  });

  it('should use the provided orderBy and sortOrder parameters', async () => {
    const dbQuery: DbQuery[] = [];
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    await searchData(mockFirestore, 'test-collection', dbQuery, 'createdAt', 'desc');

    expect(mockOrderBy).toHaveBeenCalledTimes(1);
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('should not call orderBy if orderByParam is null or empty', async () => {
    const dbQuery: DbQuery[] = [];
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    await searchData(mockFirestore, 'test-collection', dbQuery, '', 'desc');
    expect(mockOrderBy).not.toHaveBeenCalled();

    await searchData(mockFirestore, 'test-collection', dbQuery, undefined, 'desc');
    expect(mockOrderBy).not.toHaveBeenCalled();
  });

  it('should return an empty array if the snapshot is empty', async () => {
    const dbQuery: DbQuery[] = [];
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    const result = await searchData(mockFirestore, 'test-collection', dbQuery);

    expect(result).toEqual([]);
  });

  it('should map the snapshot docs to an array of data with bkey', async () => {
    const mockDocs = [
      { id: 'doc1', data: () => ({ name: 'Test 1' }) },
      { id: 'doc2', data: () => ({ name: 'Test 2' }) },
    ];
    mockGet.mockResolvedValue({ empty: false, docs: mockDocs });

    const result = await searchData(mockFirestore, 'test-collection', []);

    expect(result).toEqual([
      { name: 'Test 1', bkey: 'doc1' },
      { name: 'Test 2', bkey: 'doc2' },
    ]);
    expect(result.length).toBe(2);
  });
});
