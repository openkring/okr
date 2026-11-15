import { describe, expect, it } from 'vitest';

import { VcardImportDecision } from './vcard-import-matching';
import { applyBulkAction, filterCounts, filterIndices } from './vcard-import-review.util';

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
