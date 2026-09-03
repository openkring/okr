import { describe, expect, it } from 'vitest';
import { diaryKey, newDiary } from './diary-key.util';

describe('diaryKey', () => {
  it('is the import id shape: tenant__author__date', () => {
    expect(diaryKey('bka', 'owner_bka', '20260903')).toBe('bka__owner_bka__20260903');
  });
});

describe('newDiary', () => {
  it('seeds tenant, author, key, today, day scope, draft', () => {
    const d = newDiary('bka', 'owner_bka', '20260903');
    expect(d.tenants).toEqual(['bka']);
    expect(d.authorKey).toBe('owner_bka');
    expect(d.okey).toBe('bka__owner_bka__20260903');
    expect(d.date).toBe('20260903');
    expect(d.scope).toBe('day');
    expect(d.status).toBe('draft');
    expect(d.tags).toBe('diary');
    expect(d.weather.code).toBe(-1);
  });
  it('defaults the date to today', () => {
    expect(newDiary('bka', 'owner_bka').date).toMatch(/^\d{8}$/);
  });
});
