import { describe, expect, it } from 'vitest';

import { hiddenKeySet, isMenuKeyHidden, withHiddenKey, withoutHiddenKey } from './hidden-menu.util';

describe('isMenuKeyHidden', () => {
  it('reports a key present in the list', () => {
    expect(isMenuKeyHidden(['journal-import-bexio'], 'journal-import-bexio')).toBe(true);
  });

  it('reports a key absent from the list', () => {
    expect(isMenuKeyHidden(['journal-import-bexio'], 'journal-divider')).toBe(false);
  });

  // The field does not exist on any app-config document written before this feature. An absent
  // field MUST read as the previous behaviour — nothing hidden — or every tenant loses its menu
  // on the first deploy.
  it('treats an absent field as nothing hidden', () => {
    expect(isMenuKeyHidden(undefined, 'journal-divider')).toBe(false);
  });

  it('treats an explicitly empty list as nothing hidden', () => {
    expect(isMenuKeyHidden([], 'journal-divider')).toBe(false);
  });
});

describe('hiddenKeySet', () => {
  it('builds a set from the list', () => {
    const set = hiddenKeySet(['a', 'b']);
    expect(set.has('a')).toBe(true);
    expect(set.has('c')).toBe(false);
  });

  it('builds an empty set from an absent field', () => {
    expect(hiddenKeySet(undefined).size).toBe(0);
  });
});

describe('withHiddenKey', () => {
  it('adds a key to an absent list', () => {
    expect(withHiddenKey(undefined, 'journal-divider')).toEqual(['journal-divider']);
  });

  it('appends without disturbing the existing order', () => {
    expect(withHiddenKey(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  // Hiding an already-hidden row is a double click, not an error. It must not write a
  // duplicate, because withoutHiddenKey removes every occurrence and one stray duplicate
  // would otherwise make a single «Einblenden» look like it worked while the row stayed gone.
  it('is idempotent', () => {
    expect(withHiddenKey(['a'], 'a')).toEqual(['a']);
  });

  it('returns a new array rather than mutating the input', () => {
    const current = ['a'];
    expect(withHiddenKey(current, 'b')).not.toBe(current);
    expect(current).toEqual(['a']);
  });
});

describe('withoutHiddenKey', () => {
  it('removes the key', () => {
    expect(withoutHiddenKey(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('is idempotent for a key that is not hidden', () => {
    expect(withoutHiddenKey(['a'], 'b')).toEqual(['a']);
  });

  it('tolerates an absent list', () => {
    expect(withoutHiddenKey(undefined, 'a')).toEqual([]);
  });

  it('removes every occurrence, so a legacy duplicate cannot survive', () => {
    expect(withoutHiddenKey(['a', 'b', 'a'], 'a')).toEqual(['b']);
  });

  it('returns a new array rather than mutating the input', () => {
    const current = ['a', 'b'];
    expect(withoutHiddenKey(current, 'a')).not.toBe(current);
    expect(current).toEqual(['a', 'b']);
  });
});

describe('round trip', () => {
  it('hiding then showing restores the original list', () => {
    const start = ['x'];
    const hidden = withHiddenKey(start, 'journal-divider');
    expect(withoutHiddenKey(hidden, 'journal-divider')).toEqual(start);
  });
});
