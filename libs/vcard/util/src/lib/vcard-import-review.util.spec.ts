import { describe, expect, it } from 'vitest';

import { VcardImportDecision } from './vcard-import-matching';
import { applyBulkAction, filterCounts, filterIndices, firstLetterWithRows, letterCounts, letterOf, rowsOfLetter } from './vcard-import-review.util';

const row = (action: VcardImportDecision['action'], dup: boolean, warnings: string[] = []): VcardImportDecision =>
  ({
    draft: { warnings, kind: 'person' },
    duplicates: dup ? [{ okey: 'p', firstName: '', lastName: '', emails: [], phones: [] }] : [],
    orgDuplicates: [],
    action,
  }) as unknown as VcardImportDecision;

// 0 new, 1 new+warning, 2 dup, 3 dup+warning, 4 new
const ROWS = [row('import', false), row('import', false, ['w']), row('merge', true), row('merge', true, ['w']), row('import', false)];

describe('filterIndices', () => {
  it('selects rows per filter', () => {
    expect(filterIndices(ROWS, 'all')).toEqual([0, 1, 2, 3, 4]);
    expect(filterIndices(ROWS, 'new')).toEqual([0, 1, 4]);
    expect(filterIndices(ROWS, 'duplicates')).toEqual([2, 3]);
    expect(filterIndices(ROWS, 'warnings')).toEqual([1, 3]);
  });
});

describe('filterCounts', () => {
  it('counts every filter', () => {
    expect(filterCounts(ROWS)).toEqual({ all: 5, new: 3, duplicates: 2, warnings: 2 });
  });
});

describe('applyBulkAction', () => {
  it('leaves rows outside the indices untouched and returns a new array', () => {
    const out = applyBulkAction(ROWS, [0, 1], 'skip');
    expect(out).not.toBe(ROWS);
    expect(out.map((d) => d.action)).toEqual(['skip', 'skip', 'merge', 'merge', 'import']);
    expect(ROWS[0].action).toBe('import');
  });

  it('merge is a no-op on a new row', () => {
    expect(applyBulkAction(ROWS, [0, 2], 'merge').map((d) => d.action)).toEqual(['import', 'import', 'merge', 'merge', 'import']);
  });

  it('import on a duplicate means create anyway', () => {
    expect(applyBulkAction(ROWS, [2, 4], 'import').map((d) => d.action)).toEqual(['import', 'import', 'createAnyway', 'merge', 'import']);
  });
});

describe('letter index', () => {
  const card = (kind: 'person' | 'org', name: { firstName?: string; lastName?: string; org?: string; displayName: string }): VcardImportDecision =>
    ({
      draft: {
        kind, warnings: [], displayName: name.displayName,
        person: kind === 'person' ? { firstName: name.firstName ?? '', lastName: name.lastName ?? '' } : undefined,
        org: kind === 'org' ? { name: name.org ?? name.displayName } : undefined,
      },
      duplicates: [], orgDuplicates: [], action: 'import',
    }) as unknown as VcardImportDecision;

  it('files a person under the last name, an org under its name, umlauts under the base letter', () => {
    expect(letterOf(card('person', { firstName: 'Anna', lastName: 'Zürcher', displayName: 'Anna Zürcher' }))).toBe('Z');
    expect(letterOf(card('person', { firstName: 'Anna', lastName: 'Ärni', displayName: 'Anna Ärni' }))).toBe('A');
    expect(letterOf(card('org', { org: 'Migros', displayName: 'Migros' }))).toBe('M');
    expect(letterOf(card('person', { firstName: 'Cher', lastName: '', displayName: 'Cher' }))).toBe('C');
    expect(letterOf(card('person', { firstName: '', lastName: '', displayName: '+41 79 123 45 67' }))).toBe('#');
  });

  const ROWS2 = [
    card('person', { firstName: 'Bea', lastName: 'Muster', displayName: 'Bea Muster' }),
    card('person', { firstName: 'Anna', lastName: 'Müller', displayName: 'Anna Müller' }),
    card('org', { org: 'Acme AG', displayName: 'Acme AG' }),
    card('person', { firstName: '', lastName: '', displayName: '123' }),
  ];

  it('counts every letter A–Z plus # among the given rows', () => {
    const idx = letterCounts(ROWS2, [0, 1, 2, 3]);
    expect(idx).toHaveLength(27);
    expect(idx.find((l) => l.letter === 'M')?.count).toBe(2);
    expect(idx.find((l) => l.letter === 'A')?.count).toBe(1);
    expect(idx.find((l) => l.letter === 'B')?.count).toBe(0);
    expect(idx[26]).toEqual({ letter: '#', count: 1 });
  });

  it('lists a letter\'s rows sorted by name', () => {
    expect(rowsOfLetter(ROWS2, [0, 1, 2, 3], 'M')).toEqual([1, 0]);
    expect(rowsOfLetter(ROWS2, [0, 2], 'M')).toEqual([0]);
  });

  it('picks the first letter that has rows', () => {
    expect(firstLetterWithRows(letterCounts(ROWS2, [0, 1]))).toBe('M');
    expect(firstLetterWithRows(letterCounts(ROWS2, []))).toBe('A');
  });
});
