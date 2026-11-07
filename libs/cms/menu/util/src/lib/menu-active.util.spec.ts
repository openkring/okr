import { describe, expect, it } from 'vitest';
import { MenuItemModel } from '@okr/shared-models';
import { findActiveMenu, normaliseMenuPath } from './menu-active.util';
import { MenuTokenContext } from './menu-tokens';

const nav = (name: string, url: string): MenuItemModel =>
  ({ name, url, action: 'navigate', menuItems: [] } as unknown as MenuItemModel);
const sub = (name: string, children: string[]): MenuItemModel =>
  ({ name, url: '', action: 'sub', menuItems: children } as unknown as MenuItemModel);

const ctx: MenuTokenContext = { version: '1.0.0', tenantId: 'scs', booksId: 'gss' };
const all = () => true;
const run = (items: MenuItemModel[], path: string, extra: Partial<Parameters<typeof findActiveMenu>[0]> = {}) =>
  findActiveMenu({ rootKey: 'root', items, path, canSee: all, tokenContext: ctx, ...extra });

describe('normaliseMenuPath', () => {
  it('drops query, hash and trailing slash', () => {
    expect(normaliseMenuPath('/person/all/?a=1#x')).toBe('/person/all');
  });
  it('removes the contextMenuName of /private/{id}/{menu} and /public/{id}/{menu}', () => {
    expect(normaliseMenuPath('/private/news/c-news')).toBe('/private/news');
    expect(normaliseMenuPath('/public/news/c-news')).toBe('/public/news');
  });
  it('leaves other paths alone', () => {
    expect(normaliseMenuPath('/private/news')).toBe('/private/news');
    expect(normaliseMenuPath('/person/all/x')).toBe('/person/all/x');
  });
  it('maps the root path to the empty string', () => {
    expect(normaliseMenuPath('/')).toBe('');
  });
  it('removes the contextMenuName only for exactly three segments', () => {
    expect(normaliseMenuPath('/private/x/y/z')).toBe('/private/x/y/z');
  });
});

describe('findActiveMenu', () => {
  it('exact match wins over a longer tree position', () => {
    const items = [sub('root', ['a', 'b']), nav('a', '/person'), nav('b', '/person/all')];
    expect(run(items, '/person/all')).toEqual({ key: 'b', ancestors: [] });
    // the row listed first is the shorter one: it must still lose
    expect(run(items, '/person/all/42')).toEqual({ key: 'b', ancestors: [] });
  });

  it('longest prefix wins, at a segment boundary only', () => {
    const items = [sub('root', ['a', 'b']), nav('a', '/person/all'), nav('b', '/person')];
    expect(run(items, '/person/allowed')).toEqual({ key: 'b', ancestors: [] });
    expect(run(items, '/person/all/7')).toEqual({ key: 'a', ancestors: [] });
  });

  it('ties resolve in tree order', () => {
    const items = [sub('root', ['a', 'b']), nav('a', '/x'), nav('b', '/x')];
    expect(run(items, '/x')?.key).toBe('a');
  });

  it('resolves @TID@ and @BOOKS@ before comparing', () => {
    const items = [sub('root', ['a', 'b']), nav('a', '/album/@TID@-album'), nav('b', '/accounting/@BOOKS@/journal')];
    expect(run(items, '/album/scs-album')?.key).toBe('a');
    expect(run(items, '/accounting/gss/journal')?.key).toBe('b');
  });

  it('ignores query and hash', () => {
    const items = [sub('root', ['a']), nav('a', '/person/all')];
    expect(run(items, '/person/all?tab=2#top')?.key).toBe('a');
  });

  it('strips the contextMenuName of /private/{id}/{menu}', () => {
    const items = [sub('root', ['a']), nav('a', '/private/news')];
    expect(run(items, '/private/news/c-news')?.key).toBe('a');
  });

  it('returns the ancestors of a nested row, outermost first, without the root', () => {
    const items = [sub('root', ['g']), sub('g', ['h']), sub('h', ['leaf']), nav('leaf', '/deep')];
    expect(run(items, '/deep')).toEqual({ key: 'leaf', ancestors: ['g', 'h'] });
  });

  it('skips rows canSee refuses', () => {
    const items = [sub('root', ['a', 'b']), nav('a', '/x/y'), nav('b', '/x')];
    expect(run(items, '/x/y', { canSee: i => i.name !== 'a' })?.key).toBe('b');
  });

  it('survives a cycle A → B → A', () => {
    const items = [sub('root', ['A']), sub('A', ['B']), sub('B', ['A', 'leaf']), nav('leaf', '/l')];
    expect(run(items, '/l')).toEqual({ key: 'leaf', ancestors: ['A', 'B'] });
    expect(run(items, '/nothing')).toBeUndefined();
  });

  it('falls back to lastSelectedKey when nothing matches, with its ancestors', () => {
    const items = [sub('root', ['g']), sub('g', ['leaf']), nav('leaf', '/l')];
    expect(run(items, '/elsewhere', { lastSelectedKey: 'leaf' })).toEqual({ key: 'leaf', ancestors: ['g'] });
  });

  it('does not fall back to a lastSelectedKey the user cannot see or that is not in the tree', () => {
    const items = [sub('root', ['leaf']), nav('leaf', '/l')];
    expect(run(items, '/elsewhere', { lastSelectedKey: 'ghost' })).toBeUndefined();
    expect(run(items, '/elsewhere', { lastSelectedKey: 'leaf', canSee: () => false })).toBeUndefined();
  });

  it('returns undefined when nothing matches and there is no fallback', () => {
    const items = [sub('root', ['a']), nav('a', '/x')];
    expect(run(items, '/y')).toBeUndefined();
  });

  it('a row with url / is not active on /person', () => {
    const items = [sub('root', ['home']), nav('home', '/')];
    expect(run(items, '/person')).toBeUndefined();
  });

  it('a navigate row without a url neither throws nor matches', () => {
    const noUrl = { name: 'broken', action: 'navigate', menuItems: [] } as unknown as MenuItemModel;
    const items = [sub('root', ['broken']), noUrl];
    expect(() => run(items, '/person')).not.toThrow();
    expect(run(items, '/person')).toBeUndefined();
  });

  it('a navigate row without a url is not active on /', () => {
    const noUrl = { name: 'broken', action: 'navigate', menuItems: [] } as unknown as MenuItemModel;
    const items = [sub('root', ['broken']), noUrl];
    expect(run(items, '/')).toBeUndefined();
  });

  it('only navigate rows are candidates', () => {
    const items = [sub('root', ['s']), sub('s', [])];
    expect(run(items, '/anything')).toBeUndefined();
  });
});
