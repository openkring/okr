import { describe, expect, it } from 'vitest';
import { applyRowToggle, ancestorsOf, descendantsOf, menuKeysFor } from './block-enable-selection.util';
import type { MenuOutlineRow } from '@okr/tenant-util';

const row = (key: string, depth: number): MenuOutlineRow => ({
  depth, key, name: key, url: '/' + key, action: 'navigate', roleNeeded: 'admin', labelKey: '@item.' + key,
});

describe('descendantsOf / ancestorsOf', () => {
  // parent (0) -> child (1) -> grandchild (2); sibling (0) unrelated.
  const rows = [row('parent', 0), row('child', 1), row('grandchild', 2), row('sibling', 0)];

  it('collects every row nested below, stopping at the first row back at or above the depth', () => {
    expect(descendantsOf(rows, 0).map(r => r.key)).toEqual(['child', 'grandchild']);
  });

  it('collects the ancestor chain, nearest first', () => {
    expect(ancestorsOf(rows, 2).map(r => r.key)).toEqual(['child', 'parent']);
  });

  it('returns nothing for a leaf with no children', () => {
    expect(descendantsOf(rows, 2)).toEqual([]);
  });

  it('returns nothing for a root row', () => {
    expect(ancestorsOf(rows, 0)).toEqual([]);
  });
});

describe('applyRowToggle', () => {
  it('REGRESSION GUARD — unticking a parent must not drop an already-present child from the selection', () => {
    // The exact shape from code review: `parent` (not present) -> `child` (already present).
    // Both start ticked (the modal seeds every row on by default). The admin unticks `parent`
    // to opt out of the new row — `child` must stay selected because it renders
    // checked-and-disabled and the admin has no control to object with.
    const rows = [row('parent', 0), row('child', 1)];
    const alreadyPresent = new Set(['child']);
    const current = new Set(['parent', 'child']);

    const next = applyRowToggle(rows, current, alreadyPresent, 'parent', false);

    expect(next.has('parent')).toBe(false);
    expect(next.has('child')).toBe(true);
  });

  it('unticking a parent DOES drop a descendant that is not already present', () => {
    const rows = [row('parent', 0), row('child', 1)];
    const next = applyRowToggle(rows, new Set(), new Set(['parent', 'child']), 'parent', false);
    expect(next.has('child')).toBe(false);
  });

  it('ticking a child also ticks its ancestor chain', () => {
    const rows = [row('parent', 0), row('child', 1)];
    const next = applyRowToggle(rows, new Set(), new Set(), 'child', true);
    expect([...next].sort()).toEqual(['child', 'parent']);
  });

  it('never mutates the set passed in as `current`', () => {
    const rows = [row('a', 0)];
    const current = new Set(['a']);
    applyRowToggle(rows, current, new Set(), 'a', false);
    expect(current.has('a')).toBe(true);
  });
});

describe('menuKeysFor', () => {
  it('REGRESSION GUARD — an already-present key is in the payload even if `selected` lost it', () => {
    // Independent of applyRowToggle's own guard: even a `selected` set that (by some other bug)
    // no longer contains an already-present key must still produce it in the final payload.
    expect(menuKeysFor(new Set(['parent']), new Set(['child']))).toEqual(
      expect.arrayContaining(['parent', 'child']),
    );
  });

  it('does not duplicate a key that is both selected and already present', () => {
    expect(menuKeysFor(new Set(['a']), new Set(['a']))).toEqual(['a']);
  });
});
