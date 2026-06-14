import { describe, it, expect } from 'vitest';
import { applyCatRowConfig, buildCatRows, CatRow } from './member-cat-section.util';

const TODAY = '20260525';

function member(category: string, memberType: 'male' | 'female', active = true, exited = false) {
  return {
    category,
    memberType,
    relIsLast: active,
    dateOfExit: exited ? '20200101' : '99991231',
    memberDateOfBirth: '19900101',
  };
}

describe('buildCatRows', () => {
  it('returns only a Total row with zeros when there are no members', () => {
    const rows = buildCatRows([], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ label: 'Total', male: 0, female: 0, total: 0 });
  });

  it('excludes members where relIsLast is false', () => {
    const rows = buildCatRows([member('A', 'male', false)], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(0);
  });

  it('excludes members whose dateOfExit is in the past', () => {
    const rows = buildCatRows([member('A', 'male', true, true)], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(0);
  });

  it('creates one row per distinct category, sorted alphabetically', () => {
    const rows = buildCatRows([
      member('J', 'male'),
      member('A', 'female'),
      member('A', 'male'),
    ], TODAY);
    // A row, J row, Total row
    expect(rows).toHaveLength(3);
    expect(rows[0].label).toBe('A');
    expect(rows[1].label).toBe('J');
    expect(rows[2].label).toBe('Total');
  });

  it('counts male and female separately per category', () => {
    const rows = buildCatRows([
      member('A', 'male'),
      member('A', 'male'),
      member('A', 'female'),
      member('J', 'female'),
    ], TODAY);
    const a = rows.find(r => r.label === 'A')!;
    const j = rows.find(r => r.label === 'J')!;
    expect(a).toEqual({ label: 'A', male: 2, female: 1, total: 3 });
    expect(j).toEqual({ label: 'J', male: 0, female: 1, total: 1 });
  });

  it('total row sums all categories', () => {
    const rows = buildCatRows([
      member('A', 'male'),
      member('A', 'female'),
      member('J', 'female'),
    ], TODAY);
    const total = rows[rows.length - 1];
    expect(total).toEqual({ label: 'Total', male: 1, female: 2, total: 3 });
  });
});

describe('applyCatRowConfig', () => {
  const rows: CatRow[] = [
    { label: 'A', male: 1, female: 0, total: 1 },
    { label: 'J', male: 0, female: 1, total: 1 },
    { label: 'Total', male: 1, female: 1, total: 2 }
  ];

  it('returns rows unchanged for empty input', () => {
    expect(applyCatRowConfig([], '', 'asc')).toEqual([]);
  });

  it('keeps the Total row last when filtering', () => {
    const result = applyCatRowConfig(rows, 'a', 'asc');
    expect(result.map(r => r.label)).toEqual(['A', 'Total']);
  });

  it('reverses the body (not the Total) for desc order', () => {
    const result = applyCatRowConfig(rows, '', 'desc');
    expect(result.map(r => r.label)).toEqual(['J', 'A', 'Total']);
  });

  it('filter is case-insensitive and trimmed', () => {
    const result = applyCatRowConfig(rows, '  J  ', 'asc');
    expect(result.map(r => r.label)).toEqual(['J', 'Total']);
  });
});
