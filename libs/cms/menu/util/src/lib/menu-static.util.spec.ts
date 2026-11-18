import { describe, expect, it } from 'vitest';

import { MenuItemModel } from '@okr/shared-models';

import { buildStaticRows, isStaticActive, isStaticBulletColor, resolveStaticMenu, staticBulletColorCss } from './menu-static.util';

describe('resolveStaticMenu', () => {
  it('fills every default for an absent config', () => {
    expect(resolveStaticMenu(undefined)).toEqual({
      bulletColor: 'primary',
      bulletShape: 'square',
      bulletSize: 12,
      activeStyle: 'bold',
      childrenVisibility: 'active',
      childrenDirection: 'horizontal',
    });
  });
  it('keeps valid values', () => {
    expect(resolveStaticMenu({ staticMenu: { bulletColor: '#FFEB3B', bulletSize: 20, bulletShape: 'round' } })).toMatchObject({
      bulletColor: '#FFEB3B',
      bulletSize: 20,
      bulletShape: 'round',
    });
  });
  it('falls back per field on malformed data', () => {
    const r = resolveStaticMenu({
      staticMenu: { bulletColor: 'yellowish', bulletSize: 400, bulletShape: 'hexagon' as never, activeStyle: 'blink' as never },
    });
    expect(r).toMatchObject({ bulletColor: 'primary', bulletSize: 12, bulletShape: 'square', activeStyle: 'bold' });
  });
  it('rejects a non-integer size', () => {
    expect(resolveStaticMenu({ staticMenu: { bulletSize: 12.5 } }).bulletSize).toBe(12);
  });
});

describe('isStaticBulletColor', () => {
  it.each(['primary', 'dark', '#fff', '#FFEB3B'])('accepts %s', v => expect(isStaticBulletColor(v)).toBe(true));
  it.each(['yellowish', '#ffff', 'fff', ''])('rejects "%s"', v => expect(isStaticBulletColor(v)).toBe(false));
});

describe('staticBulletColorCss', () => {
  it('maps a name to its Ionic variable', () => expect(staticBulletColorCss('warning')).toBe('var(--ion-color-warning)'));
  it('passes a hex through', () => expect(staticBulletColorCss('#ffeb3b')).toBe('#ffeb3b'));
});

describe('isStaticActive', () => {
  it('is true only for static on a wide screen', () => {
    expect(isStaticActive('static', true)).toBe(true);
    expect(isStaticActive('static', false)).toBe(false);
    expect(isStaticActive('top', true)).toBe(false);
    expect(isStaticActive(undefined, true)).toBe(false);
  });
});

function item(name: string, action = 'navigate', menuItems: string[] = [], roleNeeded = 'registered'): MenuItemModel {
  const m = new MenuItemModel('t');
  m.name = name;
  m.action = action;
  m.menuItems = menuItems;
  m.roleNeeded = roleNeeded as never;
  return m;
}
const canSee = (i: MenuItemModel): boolean => i.roleNeeded !== 'admin';
const names = (xs: MenuItemModel[]): string[] => xs.map(x => x.name);

describe('buildStaticRows', () => {
  it('renders the screenshot menu: 6 rows, one sub with one child', () => {
    const items = [item('a'), item('b'), item('c'), item('d'), item('e'), item('s', 'sub', ['k']), item('k')];
    const r = buildStaticRows(['a', 'b', 'c', 'd', 'e', 's'], items, canSee);
    expect(names(r.rows.map(x => x.item))).toEqual(['a', 'b', 'c', 'd', 'e', 's']);
    expect(r.rows[5].children.map(c => c.name)).toEqual(['k']);
    expect(r.cut).toEqual([]);
  });
  it('cuts rows past 8 and lists them in cut', () => {
    const ns = Array.from({ length: 10 }, (_, i) => `n${i + 1}`);
    const r = buildStaticRows(ns, ns.map(n => item(n)), canSee);
    expect(r.rows).toHaveLength(8);
    expect(r.cut).toEqual(['n9', 'n10']);
  });
  it('does not count dividers or account rows', () => {
    const ns = Array.from({ length: 8 }, (_, i) => `n${i + 1}`);
    const items = [...ns.map(n => item(n)), item('d1', 'divider'), item('d2', 'divider'), item('login')];
    const r = buildStaticRows([...ns.slice(0, 4), 'd1', ...ns.slice(4), 'd2', 'login'], items, canSee);
    expect(r.rows.filter(x => x.item.action !== 'divider')).toHaveLength(8);
    expect(r.cut).toEqual([]);
    expect(r.rows[r.rows.length - 1]?.item.action).not.toBe('divider');
  });
  it('keeps the first 2 children and cuts the third', () => {
    const items = [item('s', 'sub', ['a', 'b', 'c']), item('a'), item('b'), item('c')];
    const r = buildStaticRows(['s'], items, canSee);
    expect(r.rows[0].children.map(c => c.name)).toEqual(['a', 'b']);
    expect(r.cut).toEqual(['c']);
  });
  it('cuts a nested sub', () => {
    const items = [item('s', 'sub', ['a', 'subX']), item('a'), item('subX', 'sub', ['a'])];
    const r = buildStaticRows(['s'], items, canSee);
    expect(r.rows[0].children.map(c => c.name)).toEqual(['a']);
    expect(r.cut).toEqual(['subX']);
  });
  it('does not give a hidden child a slot', () => {
    const items = [item('s', 'sub', ['hidden', 'a', 'b']), item('hidden', 'navigate', [], 'admin'), item('a'), item('b')];
    const r = buildStaticRows(['s'], items, canSee);
    expect(r.rows[0].children.map(c => c.name)).toEqual(['a', 'b']);
    expect(r.cut).toEqual([]);
  });
  it('drops a sub whose children are all hidden', () => {
    const items = [item('s', 'sub', ['hidden']), item('hidden', 'navigate', [], 'admin')];
    const r = buildStaticRows(['s'], items, canSee);
    expect(r.rows).toEqual([]);
    expect(r.cut).toEqual([]);
  });
  it('drops call/toggle/workflow rows silently', () => {
    const items = [item('a'), item('c', 'call'), item('t', 'toggle'), item('w', 'workflow')];
    const r = buildStaticRows(['a', 'c', 't', 'w'], items, canSee);
    expect(r.rows.map(x => x.item.name)).toEqual(['a']);
    expect(r.cut).toEqual([]);
  });
  it('skips a child that names its own parent', () => {
    const items = [item('x', 'sub', ['x', 'a']), item('a')];
    const r = buildStaticRows(['x'], items, canSee);
    expect(r.rows[0].children.map(c => c.name)).toEqual(['a']);
  });
  it('drops leading and trailing dividers', () => {
    const items = [item('d', 'divider'), item('a'), item('e', 'divider')];
    const r = buildStaticRows(['d', 'a', 'e'], items, canSee);
    expect(r.rows.map(x => x.item.name)).toEqual(['a']);
  });
});
