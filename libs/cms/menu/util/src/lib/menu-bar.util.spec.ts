import { describe, expect, it } from 'vitest';

import { MenuItemModel } from '@okr/shared-models';

import { barAccountKeys, barRenderableRows, countBarItems, exceedsBarLimit, isBarActive, isBarMenuType, splitBarRows, visibleBarRows } from './menu-bar.util';

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

  it('leaves out divider rows, which are no entries', () => {
    expect(countBarItems(['a', 'line', 'b'], { a: 'navigate', line: 'divider', b: 'sub' })).toBe(2);
  });

  it('counts a row whose action is unknown, and other actions the bar does not render', () => {
    expect(countBarItems(['a', 'ghost'], { a: 'call' })).toBe(2);
  });

  it('counts dividers when no actions are passed: the names alone say nothing', () => {
    expect(countBarItems(['a', 'line'])).toBe(2);
  });
});

describe('barRenderableRows', () => {
  const row = (name: string, action: string): MenuItemModel => {
    const item = new MenuItemModel('scs');
    item.name = name;
    item.action = action;
    return item;
  };
  const allActions = ['navigate', 'browse', 'sub', 'divider', 'call', 'toggle', 'workflow'].map(action => row(action, action));
  const names = (rows: MenuItemModel[]) => rows.map(item => item.name);

  it('keeps navigate, browse and sub in a top bar, in order', () => {
    expect(names(barRenderableRows(allActions, 'top'))).toEqual(['navigate', 'browse', 'sub']);
  });

  it('keeps navigate and browse in a segmented bar: a segment cannot hold a submenu', () => {
    expect(names(barRenderableRows(allActions, 'segmented'))).toEqual(['navigate', 'browse']);
  });

  it('keeps nothing for a type that has no bar', () => {
    expect(barRenderableRows(allActions, 'left')).toEqual([]);
    expect(barRenderableRows(allActions, 'right')).toEqual([]);
    expect(barRenderableRows(allActions, undefined)).toEqual([]);
  });

  it('frees the slot of a row the bar would not draw', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(name => row(name, 'navigate'));
    const stored = [rows[0], row('line', 'divider'), ...rows.slice(1)];
    const { shown, more } = splitBarRows(barRenderableRows(stored, 'top'));
    expect(names(shown)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(more).toEqual([]);
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

  it('does not count a divider row when the actions are passed', () => {
    const withDivider = [...six, 'line'];
    expect(exceedsBarLimit('top', withDivider, 1)).toBe(true);
    expect(exceedsBarLimit('top', [...five, 'line'], 1, { line: 'divider' })).toBe(false);
  });
});
