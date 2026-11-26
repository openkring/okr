import { describe, expect, it } from 'vitest';
import { MenuItemModel } from '@okr/shared-models';

import { getMenuIndex } from './menu.util';
import { collectMenuSearchRows, filterMenuSearchRows, menuSearchText, MenuSearchRow, normalizeMenuSearchText } from './menu-search.util';

const row = (name: string, action: string, extra: Partial<MenuItemModel> = {}): MenuItemModel =>
  ({ name, okey: name, action, url: '/' + name, menuItems: [], index: `n:${name} a:${action} k:${name}`, ...extra } as unknown as MenuItemModel);
const sub = (name: string, children: string[], extra: Partial<MenuItemModel> = {}) =>
  row(name, 'sub', { menuItems: children, ...extra });

const all = () => true;

describe('normalizeMenuSearchText', () => {
  it('lowercases, strips diacritics and collapses spaces', () => {
    expect(normalizeMenuSearchText('  Rückmeldung   Élève ')).toBe('ruckmeldung eleve');
  });
  it('maps undefined to the empty string', () => {
    expect(normalizeMenuSearchText(undefined)).toBe('');
  });
});

describe('collectMenuSearchRows', () => {
  const items = [
    sub('root', ['home', 'res', 'divider1', 'ctx', 'ext']),
    row('home', 'navigate'),
    sub('res', ['boats', 'home']),
    row('boats', 'navigate'),
    row('divider1', 'divider'),
    row('ctx', 'call'),
    row('ext', 'browse'),
  ];

  it('lists navigate and browse rows in tree order with their sub ancestors', () => {
    const rows = collectMenuSearchRows('root', items, all);
    expect(rows.map(r => r.item.name)).toEqual(['home', 'boats', 'ext']);
    expect(rows.find(r => r.item.name === 'boats')?.ancestors).toEqual(['res']);
    expect(rows.find(r => r.item.name === 'home')?.ancestors).toEqual([]);
  });

  it('skips a row canSee refuses, and the children of a refused sub', () => {
    const rows = collectMenuSearchRows('root', items, i => i.name !== 'res' && i.name !== 'ext');
    expect(rows.map(r => r.item.name)).toEqual(['home']);
  });

  it('survives a cycle', () => {
    const cyclic = [sub('root', ['a']), sub('a', ['b', 'root']), row('b', 'navigate')];
    expect(collectMenuSearchRows('root', cyclic, all).map(r => r.item.name)).toEqual(['b']);
  });

  it('returns nothing for an unknown root', () => {
    expect(collectMenuSearchRows('nope', items, all)).toEqual([]);
  });
});

describe('menuSearchText', () => {
  it('joins index, nickName and translated label, normalized', () => {
    const item = row('trips', 'navigate', { nickName: 'Ruderbuch' });
    expect(menuSearchText(item, 'Logbuch')).toBe('n:trips a:navigate k:trips ruderbuch logbuch');
  });
});

describe('filterMenuSearchRows', () => {
  const rows: MenuSearchRow[] = [
    { item: row('trips', 'navigate', { nickName: 'Ruderbuch' }), ancestors: [] },
    { item: row('boats', 'navigate'), ancestors: ['res'] },
    { item: row('persons', 'navigate'), ancestors: [] },
  ];
  const labels: Record<string, string> = { trips: 'Logbuch', boats: 'Boote', persons: 'Mitglieder' };
  const textOf = (r: MenuSearchRow) => menuSearchText(r.item, labels[r.item.name]);
  const names = (term: string, max?: number) => filterMenuSearchRows(rows, term, textOf, max).map(r => r.item.name);

  it('matches the translated label partially and case-insensitively', () => {
    expect(names('BOO')).toEqual(['boats']);
  });
  it('matches the nickName', () => {
    expect(names('ruder')).toEqual(['trips']);
  });
  it('matches the name from the index', () => {
    expect(names('pers')).toEqual(['persons']);
  });
  it('needs every word to match', () => {
    expect(names('log ruder')).toEqual(['trips']);
    expect(names('log boot')).toEqual([]);
  });
  it('finds nothing for an empty term', () => {
    expect(names('   ')).toEqual([]);
  });
  it('stops at max', () => {
    expect(names('navigate', 2)).toEqual(['trips', 'boats']);
  });
});

describe('getMenuIndex', () => {
  it('appends nn: only when a nickName is set', () => {
    expect(getMenuIndex(row('a', 'navigate'))).toBe('n:a a:navigate k:a');
    expect(getMenuIndex(row('a', 'navigate', { nickName: ' Logbuch ' }))).toBe('n:a a:navigate k:a nn:Logbuch');
    expect(getMenuIndex(row('a', 'navigate', { nickName: '  ' }))).toBe('n:a a:navigate k:a');
  });
});
