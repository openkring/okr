import { describe, expect, it } from 'vitest';

import { barAccountKeys, countBarItems, isBarActive, isBarMenuType } from './menu-bar.util';

describe('isBarMenuType', () => {
  it('is true for top and segmented, false for the vertical types and for absent', () => {
    expect(isBarMenuType('top')).toBe(true);
    expect(isBarMenuType('segmented')).toBe(true);
    expect(isBarMenuType('left')).toBe(false);
    expect(isBarMenuType('right')).toBe(false);
    expect(isBarMenuType(undefined)).toBe(false);
  });
});

describe('countBarItems', () => {
  it('leaves out login, logout and profile', () => {
    expect(countBarItems(['a', 'login', 'b', 'logout', 'c', 'profile'])).toBe(3);
  });

  it('counts every other row, whatever its name', () => {
    expect(countBarItems(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe(7);
  });

  it('is 0 for an absent or empty list', () => {
    expect(countBarItems(undefined)).toBe(0);
    expect(countBarItems([])).toBe(0);
  });
});

describe('barAccountKeys', () => {
  it('returns the stored reserved rows, in stored order', () => {
    expect(barAccountKeys(['logout', 'a', 'login'])).toEqual(['logout', 'login']);
  });

  it('is empty when none is stored or the list is absent', () => {
    expect(barAccountKeys(['a', 'b'])).toEqual([]);
    expect(barAccountKeys(undefined)).toEqual([]);
  });
});

describe('isBarActive', () => {
  it('is true for segmented on both widths', () => {
    expect(isBarActive('segmented', true)).toBe(true);
    expect(isBarActive('segmented', false)).toBe(true);
  });

  it('is true for top only on a wide screen', () => {
    expect(isBarActive('top', true)).toBe(true);
    expect(isBarActive('top', false)).toBe(false);
  });

  it('is false for left, right and absent', () => {
    for (const type of ['left', 'right', undefined] as const) {
      expect(isBarActive(type, true)).toBe(false);
      expect(isBarActive(type, false)).toBe(false);
    }
  });
});
