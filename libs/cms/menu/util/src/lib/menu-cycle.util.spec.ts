import { describe, expect, it } from 'vitest';

import { isMenuBlocked, MAX_MENU_DEPTH, nextVisitedKeys } from './menu-cycle.util';

describe('nextVisitedKeys', () => {
  it('appends the current name to the path', () => {
    expect([...nextVisitedKeys(new Set(['root']), 'a')]).toEqual(['root', 'a']);
  });
  it('does not mutate the input set', () => {
    const input = new Set(['root']);
    nextVisitedKeys(input, 'a');
    expect([...input]).toEqual(['root']);
  });
});

describe('isMenuBlocked', () => {
  it('detects a 3-node cycle root → A → B → A', () => {
    // root renders A
    const rootVisited = new Set<string>();
    expect(isMenuBlocked(rootVisited, 'A', 0)).toBe(false);
    // A (path now {root}) renders B
    const aVisited = nextVisitedKeys(rootVisited, 'root');
    expect(isMenuBlocked(aVisited, 'B', 1)).toBe(false);
    // B (path now {root, A}) renders A again → cycle
    const bVisited = nextVisitedKeys(aVisited, 'A');
    expect(isMenuBlocked(bVisited, 'A', 2)).toBe(true);
  });

  it('breaks a direct self-reference on the second occurrence', () => {
    // A renders itself once (allowed), the repeat is blocked
    expect(isMenuBlocked(new Set(['root']), 'A', 1)).toBe(false);
    expect(isMenuBlocked(new Set(['root', 'A']), 'A', 2)).toBe(true);
  });

  it('caps nesting depth at MAX_MENU_DEPTH regardless of cycles', () => {
    expect(isMenuBlocked(new Set(), 'fresh', MAX_MENU_DEPTH - 1)).toBe(false);
    expect(isMenuBlocked(new Set(), 'fresh', MAX_MENU_DEPTH)).toBe(true);
  });
});
