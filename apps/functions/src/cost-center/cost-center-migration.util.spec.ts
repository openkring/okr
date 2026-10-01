import { describe, expect, it } from 'vitest';
import { bookOfDoc, decideFreeText, freeTextBlocker, matchCostCenterText } from './cost-center-migration.util';

const centers = [
  { okey: 'k1', id: '310', name: 'Junioren', parentKey: '', accountingTenantId: 'scs' },
  { okey: 'k2', id: '300', name: 'Sport', parentKey: '', accountingTenantId: 'scs' },
  { okey: 'k3', id: '320', name: 'Regatta', parentKey: 'k2', accountingTenantId: 'scs' },
];
describe('matchCostCenterText', () => {
  it('keeps a value that already is a valid okey', () => expect(matchCostCenterText('k1', centers, 'scs')).toBe('k1'));
  it('matches number or name case-insensitively', () => {
    expect(matchCostCenterText(' 310 ', centers, 'scs')).toBe('k1');
    expect(matchCostCenterText('JUNIOREN', centers, 'scs')).toBe('k1');
  });
  it('does not match a group', () => expect(matchCostCenterText('Sport', centers, 'scs')).toBe(''));
  it('returns empty for unknown text and for empty input', () => {
    expect(matchCostCenterText('Vorstand', centers, 'scs')).toBe('');
    expect(matchCostCenterText('', centers, 'scs')).toBe('');
  });
});

describe('decideFreeText', () => {
  // scs holds two sets of books: scs (k1..k3) and gss (g1)
  const gss = [{ okey: 'g1', id: '910', name: 'Gastro', parentKey: '', accountingTenantId: 'gss' }];
  const all = new Set(['k1', 'k2', 'k3', 'g1', 'kOld']);
  const decide = (value: string, docBook: string | undefined, book = 'scs', of = centers) => decideFreeText(value, docBook, book, of, all);

  it('skips an empty value', () => expect(decide('  ', 'scs')).toEqual({ action: 'skip' }));
  it('rewrites a matching text of the chosen book', () => expect(decide('Junioren', 'scs')).toEqual({ action: 'rewrite', newValue: 'k1' }));
  it('keeps a tenant okey via the short-circuit', () => expect(decide('k1', 'scs')).toEqual({ action: 'keep' }));
  it('keeps a valid okey of the book even when the tenant set is empty (matcher path)', () =>
    expect(decideFreeText('k1', 'scs', 'scs', centers, new Set())).toEqual({ action: 'keep' }));
  it('clears an unmatched text of the chosen book', () => expect(decide('Vorstand', 'scs')).toEqual({ action: 'clear' }));
  it('skips a doc that belongs to another book', () => expect(decide('Vorstand', 'gss')).toEqual({ action: 'skip' }));
  it('never clears the okey of a centre of another book of the tenant', () => {
    expect(decide('k1', 'scs', 'gss', gss)).toEqual({ action: 'keep' });
    expect(decide('g1', undefined, 'scs')).toEqual({ action: 'keep' });
  });
  it('keeps the okey of an archived centre', () => expect(decide('kOld', 'scs')).toEqual({ action: 'keep' }));
  it('lists an unattributed legacy doc instead of clearing it', () => {
    expect(decide('Vorstand', undefined)).toEqual({ action: 'unattributed' });
    expect(decide('310', '')).toEqual({ action: 'unattributed' });
  });
});

describe('bookOfDoc', () => {
  const accountBook = new Map([['a1', 'scs'], ['a2', 'gss']]);
  it('an own non-empty book wins', () => expect(bookOfDoc('gss', 'a1', accountBook)).toBe('gss'));
  it('falls back to the book of the account', () => {
    expect(bookOfDoc('', 'a1', accountBook)).toBe('scs');
    expect(bookOfDoc(undefined, 'a2', accountBook)).toBe('gss');
  });
  it('is undefined for an unknown or empty account', () => {
    expect(bookOfDoc('', 'zzz', accountBook)).toBeUndefined();
    expect(bookOfDoc('', '', accountBook)).toBeUndefined();
    expect(bookOfDoc('', undefined, accountBook)).toBeUndefined();
  });
  it('a gss account yields a skip in an scs run', () =>
    expect(decideFreeText('Vorstand', bookOfDoc('', 'a2', accountBook), 'scs', centers, new Set())).toEqual({ action: 'skip' }));
});

describe('freeTextBlocker', () => {
  it('refuses a book without any cost centre (every legacy value would be cleared)', () =>
    expect(freeTextBlocker([], 'scs')).toBe('no-cost-centers'));
  it('refuses a book whose only cost centres are groups, archived or of another book', () => {
    expect(freeTextBlocker([
      { okey: 'g', parentKey: '', type: 'root', accountingTenantId: 'scs' },
      { okey: 'a', parentKey: 'g', type: 'leaf', isArchived: true, accountingTenantId: 'scs' },
      { okey: 'o', parentKey: '', accountingTenantId: 'gss' },
    ], 'scs')).toBe('no-cost-centers');
  });
  it('allows the step once the book has an active leaf', () => expect(freeTextBlocker(centers, 'scs')).toBeUndefined());
});
