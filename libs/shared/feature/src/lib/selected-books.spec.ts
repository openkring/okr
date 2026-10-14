import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStoredBooks, resolveCurrentBooks, SELECTED_BOOKS_STORAGE_PREFIX, writeStoredBooks } from './selected-books';

describe('stored books choice', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips the explicit choice per app tenant', () => {
    writeStoredBooks('scs', 'gss');
    expect(localStorage.getItem(SELECTED_BOOKS_STORAGE_PREFIX + 'scs')).toBe('gss');
    expect(readStoredBooks('scs')).toBe('gss');
    expect(readStoredBooks('kring')).toBe('');
  });

  it('ignores an empty tenant or empty books', () => {
    writeStoredBooks('', 'gss');
    writeStoredBooks('scs', '');
    expect(localStorage.length).toBe(0);
    expect(readStoredBooks('')).toBe('');
  });

  it('is empty when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => writeStoredBooks('scs', 'gss')).not.toThrow();
    expect(readStoredBooks('scs')).toBe('');
  });
});

describe('resolveCurrentBooks', () => {
  it('takes the choice while it is available', () => {
    expect(resolveCurrentBooks('gss', ['gss', 'scs'], 'scs')).toBe('gss');
  });
  it('trusts the choice while the list is unknown (not loaded, or not a treasurer)', () => {
    expect(resolveCurrentBooks('gss', [], 'scs')).toBe('gss');
  });
  it('falls back to the default books when the choice no longer exists', () => {
    expect(resolveCurrentBooks('old', ['gss', 'scs'], 'scs')).toBe('scs');
  });
  it('falls back to the default books without a choice', () => {
    expect(resolveCurrentBooks('', ['gss', 'scs'], 'scs')).toBe('scs');
  });
  it('is empty when there are no books at all', () => {
    expect(resolveCurrentBooks('', [], '')).toBe('');
  });
});
