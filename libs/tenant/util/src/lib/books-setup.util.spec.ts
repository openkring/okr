import { describe, expect, it } from 'vitest';

import { booksSetupProblems, needsBooksSetup, type BooksSetupInput } from './books-setup.util';

const valid: BooksSetupInput = {
  booksId: 'la21staefa', name: 'LA21 Stäfa', backend: 'native', fiscalYearStart: 1, vatMethod: 'exempt', vatPeriod: 'quarterly',
};

describe('booksSetupProblems', () => {
  it('accepts a complete input', () => {
    expect(booksSetupProblems(valid)).toEqual([]);
  });

  it('rejects an id with uppercase letters, spaces or a leading digit', () => {
    for (const booksId of ['LA21', 'la 21', '1abc', 'a', '']) {
      expect(booksSetupProblems({ ...valid, booksId })).toEqual(['booksId']);
    }
  });

  it('rejects a blank name', () => {
    expect(booksSetupProblems({ ...valid, name: '   ' })).toEqual(['name']);
  });

  it('rejects a fiscal year start outside 1–12', () => {
    expect(booksSetupProblems({ ...valid, fiscalYearStart: 0 })).toEqual(['fiscalYearStart']);
    expect(booksSetupProblems({ ...valid, fiscalYearStart: 13 })).toEqual(['fiscalYearStart']);
    expect(booksSetupProblems({ ...valid, fiscalYearStart: 1.5 })).toEqual(['fiscalYearStart']);
  });

  it('rejects datev and unknown VAT values', () => {
    expect(booksSetupProblems({ ...valid, backend: 'datev' as never })).toEqual(['backend']);
    expect(booksSetupProblems({ ...valid, vatMethod: 'x' as never, vatPeriod: 'yearly' as never })).toEqual(['vatMethod', 'vatPeriod']);
  });

  it('reports every field for a missing input', () => {
    expect(booksSetupProblems(undefined)).toHaveLength(6);
  });
});

describe('needsBooksSetup', () => {
  it('asks only while finance is on and no default books exist', () => {
    expect(needsBooksSetup(true, '')).toBe(true);
    expect(needsBooksSetup(true, undefined)).toBe(true);
    expect(needsBooksSetup(true, 'scs')).toBe(false);
    expect(needsBooksSetup(false, '')).toBe(false);
  });
});
