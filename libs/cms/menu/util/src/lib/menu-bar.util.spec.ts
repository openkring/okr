import { describe, expect, it } from 'vitest';

import { MenuItemModel } from '@okr/shared-models';

import { barAccountKeys, countBarItems, exceedsBarLimit, isBarActive, isBarMenuType, splitBarRows, visibleBarRows } from './menu-bar.util';

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

describe('splitBarRows', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `row${i + 1}`);

  it('shows 6 rows unchanged and has no overflow', () => {
    expect(splitBarRows(rows(6))).toEqual({ shown: rows(6), more: [] });
  });

  it('shows 5 and moves the other 2 under «Mehr» when there are 7', () => {
    expect(splitBarRows(rows(7))).toEqual({ shown: rows(5), more: ['row6', 'row7'] });
  });

  it('is empty for no rows', () => {
    expect(splitBarRows([])).toEqual({ shown: [], more: [] });
  });
});

describe('exceedsBarLimit', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];
  const five = ['a', 'b', 'c', 'd', 'e'];

  it('never warns for a sidebar menu', () => {
    expect(exceedsBarLimit('left', six, 5)).toBe(false);
    expect(exceedsBarLimit('right', six, 5)).toBe(false);
    expect(exceedsBarLimit(undefined, six, 5)).toBe(false);
  });

  it('warns when a top menu with 6 rows gets 1 more', () => {
    expect(exceedsBarLimit('top', six, 1)).toBe(true);
  });

  it('does not warn when a top menu with 5 rows gets 1 more', () => {
    expect(exceedsBarLimit('top', five, 1)).toBe(false);
  });

  it('does not count the reserved account rows of a segmented menu', () => {
    expect(exceedsBarLimit('segmented', [...five, 'login', 'logout', 'profile'], 1)).toBe(false);
    expect(exceedsBarLimit('segmented', [...six, 'login'], 1)).toBe(true);
  });

  it('treats an absent root document as empty', () => {
    expect(exceedsBarLimit('top', undefined, 6)).toBe(false);
    expect(exceedsBarLimit('top', undefined, 7)).toBe(true);
  });
});
