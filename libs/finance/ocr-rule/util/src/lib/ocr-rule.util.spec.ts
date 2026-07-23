import { describe, it, expect } from 'vitest';
import { AccountModel } from '@okr/shared-models';
import { normalizeParty, leafAccounts } from './ocr-rule.util';

describe('normalizeParty (must match CF normalizeVendor)', () => {
  it('lowercases, strips diacritics + legal suffix', () => {
    expect(normalizeParty('MIGROS Zürich AG')).toBe('migros zurich');
  });
  it('handles a bare single token', () => {
    expect(normalizeParty('Migros')).toBe('migros');
  });
  it('drops punctuation and the GmbH suffix, strips accents', () => {
    expect(normalizeParty('Café Sélect GmbH')).toBe('cafe select');
  });
  it('drops the Genossenschaft suffix', () => {
    expect(normalizeParty('Coop Genossenschaft')).toBe('coop');
  });
  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeParty('')).toBe('');
    expect(normalizeParty('   ')).toBe('');
  });
});

describe('leafAccounts', () => {
  const mk = (okey: string, parentKey: string): AccountModel =>
    Object.assign(new AccountModel('t'), { okey, parentKey });

  it('returns only accounts that are no other account\'s parent', () => {
    const accounts = [mk('a', ''), mk('b', 'a'), mk('c', 'b')];
    expect(leafAccounts(accounts).map(a => a.okey)).toEqual(['c']);
  });
  it('treats a flat list (no children) as all leaves', () => {
    const accounts = [mk('x', ''), mk('y', '')];
    expect(leafAccounts(accounts).map(a => a.okey)).toEqual(['x', 'y']);
  });
  it('returns empty for empty input', () => {
    expect(leafAccounts([])).toEqual([]);
  });
});
