import { describe, expect, it } from 'vitest';

import { resolveSelectedBooks } from './accounting-books';

const base = { routeBooks: '', storedChoice: '', defaultBooks: 'scs', available: ['scs', 'gss'] };

describe('resolveSelectedBooks', () => {
  it('takes the route first', () => {
    expect(resolveSelectedBooks({ ...base, routeBooks: 'gss', storedChoice: 'scs' })).toBe('gss');
  });
  it('then the stored choice', () => {
    expect(resolveSelectedBooks({ ...base, storedChoice: 'gss' })).toBe('gss');
  });
  it('then the default books', () => {
    expect(resolveSelectedBooks(base)).toBe('scs');
  });
  it('discards a stored choice that is not available', () => {
    expect(resolveSelectedBooks({ ...base, storedChoice: 'old' })).toBe('scs');
  });
  it('trusts the route and the default while the list is empty (not loaded, or no config doc yet)', () => {
    expect(resolveSelectedBooks({ ...base, available: [], storedChoice: 'gss' })).toBe('scs');
    expect(resolveSelectedBooks({ ...base, available: [], routeBooks: 'gss' })).toBe('gss');
  });
  it('returns "" when there are no books at all', () => {
    expect(resolveSelectedBooks({ routeBooks: '', storedChoice: '', defaultBooks: '', available: [] })).toBe('');
  });
});
