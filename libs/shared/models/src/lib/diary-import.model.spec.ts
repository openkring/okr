import { describe, expect, it } from 'vitest';
import { DiaryImportCollection, DiaryImportModel } from './diary-import.model';

describe('DiaryImportModel', () => {
  it('names its collection', () => {
    expect(DiaryImportCollection).toBe('diaryImports');
  });

  it('starts as a reading run with empty counts', () => {
    const m = new DiaryImportModel('bka');
    expect(m.tenants).toEqual(['bka']);
    expect(m.phase).toBe('reading');
    expect(m.processed).toBe(0);
    expect(m.errors).toEqual([]);
    expect(m.unresolvedPeople).toEqual({});
  });
});
