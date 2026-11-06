import { describe, expect, it } from 'vitest';

import { MenuItemModel } from '@okr/shared-models';

import { barAccountKeys, countBarItems, isBarActive, isBarMenuType, visibleBarRows } from './menu-bar.util';

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

describe('visibleBarRows', () => {
  const row = (name: string, roleNeeded = 'registered'): MenuItemModel => {
    const item = new MenuItemModel('scs');
    item.name = name;
    item.roleNeeded = roleNeeded as MenuItemModel['roleNeeded'];
    return item;
  };
  const items = [row('a'), row('b', 'admin'), row('c'), row('login'), row('logout'), row('profile')];
  const all = () => true;

  it('keeps the order of the root, not the order of the list', () => {
    expect(visibleBarRows(['c', 'a'], items, all).map(i => i.name)).toEqual(['c', 'a']);
  });

  it('drops login, logout and profile: they belong to the account area', () => {
    expect(visibleBarRows(['a', 'login', 'profile', 'logout', 'c'], items, all).map(i => i.name)).toEqual(['a', 'c']);
  });

  it('drops the rows canSee refuses', () => {
    expect(visibleBarRows(['a', 'b', 'c'], items, i => i.roleNeeded !== 'admin').map(i => i.name)).toEqual(['a', 'c']);
  });

  it('drops a name that has no row in the list', () => {
    expect(visibleBarRows(['a', 'gone', 'c'], items, all).map(i => i.name)).toEqual(['a', 'c']);
  });

  it('is empty for an absent root list or an empty list of rows', () => {
    expect(visibleBarRows([], items, all)).toEqual([]);
    expect(visibleBarRows(['a'], [], all)).toEqual([]);
  });
});
