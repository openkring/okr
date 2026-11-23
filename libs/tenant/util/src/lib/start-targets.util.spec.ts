import { FOOTPRINT_PAGE_TYPE, MenuItemModel, PageModel, type RoleName } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { FEATURE_BLOCKS } from './feature-blocks';
import type { FeatureBlock, MenuSpec } from './feature-catalogue.types';
import { startOptions, startTargets, type StartTargetsInput } from './start-targets.util';

function row(name: string, url: string, patch: Partial<MenuItemModel> = {}): MenuItemModel {
  return Object.assign(new MenuItemModel('scs'), { okey: name, name, url, label: `l:${name}`, action: 'navigate', roleNeeded: 'registered', ...patch });
}

function page(okey: string, patch: Partial<PageModel> = {}): PageModel {
  return Object.assign(new PageModel('scs'), { okey, name: `n:${okey}`, isPrivate: false, ...patch });
}

function block(id: string, menu: Partial<MenuSpec>[]): FeatureBlock {
  return { id, menu: menu.map((m) => ({ key: m.name, action: 'navigate', roleNeeded: 'registered', icon: '', label: '', ...m })) } as unknown as FeatureBlock;
}

const BLOCKS = [
  block('diary', [{ name: 'diary', url: '/diary/all/c-diary' }]),
  block('cms', [{ name: 'dashboard', url: '/private/dashboard/c-contentpage' }, { name: 'shared', url: '', action: 'sub' }]),
  block('games', [{ name: 'shared', url: '', action: 'sub' }, { name: 'quiz', url: '/quiz' }]),
];

function urls(menuDocs: MenuItemModel[], patch: Partial<StartTargetsInput> = {}): string[] {
  return startTargets({
    menuDocs, pages: [], blocks: BLOCKS, isEnabled: () => true, hiddenKeys: new Set(), tenantId: 'scs', ...patch,
  }).map((t) => t.url);
}

describe('startTargets, menu rows', () => {
  it('offers navigate rows with their raw label', () => {
    const targets = startTargets({
      menuDocs: [row('diary', '/diary/all/c-diary'), row('dashboard', '/private/dashboard/c-contentpage')],
      pages: [], blocks: BLOCKS, isEnabled: () => true, hiddenKeys: new Set(), tenantId: 'scs',
    });
    expect(targets).toEqual([
      { url: '/diary/all/c-diary', label: 'l:diary' }, { url: '/private/dashboard/c-contentpage', label: 'l:dashboard' },
    ]);
  });
  it('offers nothing that is not a navigate row', () => {
    for (const action of ['sub', 'context', 'call', 'toggle', 'divider', 'browse', 'main', 'workflow']) {
      expect(urls([row('x', '/x', { action })]), action).toEqual([]);
    }
  });
  it('offers rows every signed-in person may open, and no others', () => {
    for (const role of ['public', 'none', 'registered', undefined]) {
      expect(urls([row('x', '/x', { roleNeeded: role as RoleName })]), String(role)).toEqual(['/x']);
    }
    for (const role of ['anonymous', 'privileged', 'contentAdmin', 'admin', 'kiosk', 'tester', 'weird']) {
      expect(urls([row('x', '/x', { roleNeeded: role as RoleName })]), role).toEqual([]);
    }
  });
  it('judges a row by the menus it hangs under', () => {
    const x = row('x', '/x');
    const strict = row('strict', '', { action: 'sub', roleNeeded: 'admin', menuItems: ['x'] });
    const open = row('open', '', { action: 'sub', menuItems: ['x'] });
    expect(urls([x, strict])).toEqual([]);
    expect(urls([x, strict, open])).toEqual(['/x']);
    expect(urls([x, open, row('top', '', { action: 'sub', roleNeeded: 'privileged', menuItems: ['open'] })])).toEqual([]);
  });
  it('ends when menus contain each other', () => {
    const a = row('a', '', { action: 'sub', menuItems: ['b', 'x'] });
    const b = row('b', '', { action: 'sub', menuItems: ['a'] });
    expect(urls([row('x', '/x'), a, b])).toEqual([]);
    expect(urls([row('x', '/x'), a, b, row('main_scs', '', { action: 'main', roleNeeded: 'public', menuItems: ['a'] })])).toEqual(['/x']);
  });
  it('leaves out hidden and archived rows, and what hangs only under them', () => {
    const parent = row('p', '', { action: 'sub', menuItems: ['x'] });
    expect(urls([row('x', '/x')], { hiddenKeys: new Set(['x']) })).toEqual([]);
    expect(urls([row('x', '/x'), parent], { hiddenKeys: new Set(['p']) })).toEqual([]);
    expect(urls([row('x', '/x', { isArchived: true })])).toEqual([]);
  });
  it('asks whether a block that declares the row is on', () => {
    const only = (id: string) => ({ isEnabled: (b: string) => b === id });
    const diary = row('diary', '/diary/all/c-diary');
    expect(urls([diary], only('diary'))).toEqual(['/diary/all/c-diary']);
    expect(urls([diary], only('cms'))).toEqual([]);
    const shared = [row('x', '/x'), row('shared', '', { action: 'sub', menuItems: ['x'] })];
    expect(urls(shared, only('games'))).toEqual(['/x']);
    expect(urls(shared, only('diary'))).toEqual([]);
  });
  it('asks the block behind the url of an own row too', () => {
    const only = (id: string) => ({ isEnabled: (b: string) => b === id });
    expect(urls([row('mine', '/diary/all/c-diary')], only('cms'))).toEqual([]);
    expect(urls([row('mine', '/diary/2024/c-diary')], only('cms'))).toEqual([]);
    expect(urls([row('mine', '/private/about/c-contentpage')], only('cms'))).toEqual(['/private/about/c-contentpage']);
    expect(urls([row('mine', '/elsewhere')], only('cms'))).toEqual(['/elsewhere']);
  });
  it('resolves the tenant, and offers no url that needs more than that', () => {
    expect(urls([row('x', '/album/@TID@-album/c-album')])).toEqual(['/album/scs-album/c-album']);
    for (const url of ['/my-cost-centers/@BOOKS@', '/x/@UNKNOWN@', '/x/:key', '', '/', '//host/x', 'https://host/x', '/web/x']) {
      expect(urls([row('x', url)]), url).toEqual([]);
    }
  });
  it('adds a missing slash, keeps a query', () => {
    expect(urls([row('x', 'x/all'), row('y', '/y?view=list')])).toEqual(['/x/all', '/y?view=list']);
  });
  it('never offers signing in or out', () => {
    expect(urls([row('logout', '/auth/logout'), row('login', '/auth/login', { roleNeeded: 'public' })])).toEqual([]);
  });
  it('lists a url once', () => {
    expect(urls([row('x', '/x'), row('x2', 'x')])).toEqual(['/x']);
  });
  it('offers the live kinds of start pages from the real catalogue', () => {
    expect(urls([
      row('diary', '/diary/all/c-diary'), row('dashboard', '/private/dashboard/c-contentpage'), row('person-contacts', '/person/all/c-persons'),
      row('logout', '/auth/logout'),
    ], { blocks: FEATURE_BLOCKS })).toEqual(['/diary/all/c-diary', '/private/dashboard/c-contentpage', '/person/all/c-persons']);
  });
});

describe('startTargets, pages', () => {
  it('offers pages visible without signing in, by name', () => {
    const targets = startTargets({
      menuDocs: [], pages: [page('welcome_scs'), page('secret', { isPrivate: true }), page('untitled', { name: '', title: 'Titel' })],
      blocks: BLOCKS, isEnabled: () => true, hiddenKeys: new Set(), tenantId: 'scs',
    });
    expect(targets).toEqual([{ url: '/public/welcome_scs', label: 'n:welcome_scs' }, { url: '/public/untitled', label: 'Titel' }]);
  });
  it('leaves out footprints, error pages, archived pages and the shared page behind an own copy', () => {
    const pages = [
      page('help'), page('help_scs'), page('f', { type: FOOTPRINT_PAGE_TYPE }), page('e', { type: 'error' }), page('a', { isArchived: true }),
      page('terms'), page('terms_scs', { isPrivate: true }),
    ];
    expect(urls([], { pages })).toEqual(['/public/help_scs']);
  });
  it('lists a page once when a menu row has the same url', () => {
    expect(urls([row('help', '/public/help')], { pages: [page('help')] })).toEqual(['/public/help']);
  });
});

describe('startOptions', () => {
  const targets = [{ url: '/b', label: 'Beta' }, { url: '/a', label: 'Alpha' }];
  it('sorts by label', () => {
    expect(startOptions(targets, '/a')).toEqual([{ key: '/a', label: 'Alpha' }, { key: '/b', label: 'Beta' }]);
  });
  it('keeps a stored url that is not among them, first and as it is', () => {
    expect(startOptions(targets, '/person/all/c-persons?filters=search')[0]).toEqual({ key: '/person/all/c-persons?filters=search', label: '/person/all/c-persons?filters=search' });
    expect(startOptions([], '/x')).toEqual([{ key: '/x', label: '/x' }]);
    expect(startOptions(targets, '').map((o) => o.key)).toEqual(['/a', '/b']);
  });
  it('tells equal labels apart by their url, and shows the url without a label', () => {
    const same = [{ url: '/b', label: 'Hilfe' }, { url: '/a', label: 'Hilfe' }, { url: '/c', label: '' }];
    expect(startOptions(same, '').map((o) => o.label)).toEqual(['/c', 'Hilfe (/a)', 'Hilfe (/b)']);
  });
});
