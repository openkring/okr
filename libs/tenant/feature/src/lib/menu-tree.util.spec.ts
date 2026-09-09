import { describe, expect, it } from 'vitest';
import type { MenuItemModel } from '@okr/shared-models';
import type { FeatureBlock, MenuStructureDrift } from '@okr/tenant-util';
import { buildMenuTree, filterMenuRows } from './menu-tree.util';

const doc = (okey: string, menuItems: string[] = []): MenuItemModel => ({
  okey, name: okey, tenants: ['scs'], menuItems, isArchived: false,
  url: '', action: 'navigate', roleNeeded: 'none', label: '', icon: '',
  index: '', description: '', tags: '',
} as unknown as MenuItemModel);

const CALEVENT: FeatureBlock = {
  id: 'calevent', bundle: 'events', label: 'Anlässe', icon: 'calendar',
  defaultAvailability: 'ga', dependsOn: [], collections: [],
  menu: [{
    key: 'event-menu', name: 'event-menu', url: '', action: 'sub', roleNeeded: 'none',
    icon: 'calendar', label: '@item.event-menu',
    children: [
      { key: 'calevent-all', name: 'calevent-all', url: '/calevent/all', action: 'navigate',
        roleNeeded: 'none', icon: 'calendar', label: '@item.calevent-all' },
      { key: 'calevent-my', name: 'calevent-my', url: '/calevent/my', action: 'navigate',
        roleNeeded: 'none', icon: 'calendar', label: '@item.calevent-my' },
    ],
  }],
};

/** A second block with a two-level absent subtree, used to test cascading-absent placement. */
const FINANCE: FeatureBlock = {
  id: 'finance', bundle: 'finance', label: 'Finanzen', icon: 'cash',
  defaultAvailability: 'ga', dependsOn: [], collections: [],
  menu: [{
    key: 'finance-menu', name: 'finance-menu', url: '', action: 'sub', roleNeeded: 'none',
    icon: 'cash', label: '@item.finance-menu',
    children: [
      { key: 'finance-invoices', name: 'finance-invoices', url: '/finance/invoices',
        action: 'navigate', roleNeeded: 'none', icon: 'cash', label: '@item.finance-invoices' },
    ],
  }],
};

const base = (
  existing: Map<string, MenuItemModel>, drift: MenuStructureDrift[] = [],
  enabledBlocks: FeatureBlock[] = [CALEVENT],
) => buildMenuTree({ rootKey: 'main_scs', existing, drift, enabledBlocks });

describe('buildMenuTree', () => {
  it('walks the live tree depth-first and reports depth', () => {
    const existing = new Map([
      ['main_scs', doc('main_scs', ['event-menu'])],
      ['event-menu', doc('event-menu', ['calevent-all'])],
      ['calevent-all', doc('calevent-all')],
    ]);
    const rows = base(existing);
    expect(rows.map(r => [r.name, r.depth])).toEqual([
      ['event-menu', 0], ['calevent-all', 1], ['calevent-my', 1],
    ]);
  });

  it('marks a row with catalogue drift as drifted and carries both roleNeeded values', () => {
    const live = doc('calevent-all');
    live.roleNeeded = 'registered';
    const existing = new Map([
      ['main_scs', doc('main_scs', ['calevent-all'])], ['calevent-all', live],
    ]);
    const drift: MenuStructureDrift[] = [{
      name: 'calevent-all', docId: 'calevent-all', forked: false, pinned: [],
      fields: { roleNeeded: 'none' }, live: { roleNeeded: 'registered' },
    }];
    const row = base(existing, drift).find(r => r.name === 'calevent-all');
    expect(row).toMatchObject({
      state: 'drifted', roleNeededLive: 'registered', roleNeededCatalogue: 'none',
      blockId: 'calevent', otherDrift: [],
    });
  });

  it('marks a pinned field as pinned rather than drifted', () => {
    const live = doc('calevent-all');
    live.roleNeeded = 'registered';
    live.ownedFields = ['roleNeeded'];
    const existing = new Map([
      ['main_scs', doc('main_scs', ['calevent-all'])], ['calevent-all', live],
    ]);
    const drift: MenuStructureDrift[] = [{
      name: 'calevent-all', docId: 'calevent-all', forked: false, pinned: ['roleNeeded'],
      fields: { roleNeeded: 'none' }, live: { roleNeeded: 'registered' },
    }];
    expect(base(existing, drift).find(r => r.name === 'calevent-all')?.state).toBe('pinned');
  });

  it('lists a catalogue row the tenant does not have under its catalogue parent as absent', () => {
    const existing = new Map([
      ['main_scs', doc('main_scs', ['event-menu'])],
      ['event-menu', doc('event-menu', ['calevent-all'])],
      ['calevent-all', doc('calevent-all')],
    ]);
    const row = base(existing).find(r => r.name === 'calevent-my');
    expect(row).toMatchObject({ state: 'absent', docId: '', depth: 1, blockId: 'calevent' });
  });

  it('marks a row no block owns as tenant-authored', () => {
    const existing = new Map([
      ['main_scs', doc('main_scs', ['vereinsheim'])], ['vereinsheim', doc('vereinsheim')],
    ]);
    expect(base(existing).find(r => r.name === 'vereinsheim'))
      .toMatchObject({ state: 'tenant-authored', blockId: '' });
  });

  it('terminates on a cyclic menu (A -> B -> A)', () => {
    const existing = new Map([
      ['main_scs', doc('main_scs', ['a'])],
      ['a', doc('a', ['b'])], ['b', doc('b', ['a'])],
    ]);
    const rows = base(existing);
    expect(rows.filter(r => r.name === 'a')).toHaveLength(1);
  });

  // --- cases added beyond the brief -----------------------------------------------------

  it('drifts on url only and reports it via otherDrift, leaving roleNeeded columns equal', () => {
    const live = doc('calevent-all');
    live.url = '/calevent/all-changed';
    const existing = new Map([
      ['main_scs', doc('main_scs', ['calevent-all'])], ['calevent-all', live],
    ]);
    const drift: MenuStructureDrift[] = [{
      name: 'calevent-all', docId: 'calevent-all', forked: false, pinned: [],
      fields: { url: '/calevent/all' }, live: { url: '/calevent/all-changed' },
    }];
    const row = base(existing, drift).find(r => r.name === 'calevent-all');
    expect(row).toMatchObject({
      state: 'drifted', otherDrift: ['url'],
      roleNeededLive: 'none', roleNeededCatalogue: 'none',
    });
  });

  it('stays drifted when one differing field is pinned but another is not (mixed row)', () => {
    // Decision (see menu-tree.util.ts): `pinned` wins only when EVERY differing field is
    // pinned. A row with an unpinned divergence still needs the admin's attention, so it
    // must not read as "fully accounted for" — `otherDrift` then reports only the
    // non-pinned divergence (`url`), since the pinned `roleNeeded` is not a drift to flag.
    const live = doc('calevent-all');
    live.roleNeeded = 'registered';
    live.url = '/calevent/all-changed';
    live.ownedFields = ['roleNeeded'];
    const existing = new Map([
      ['main_scs', doc('main_scs', ['calevent-all'])], ['calevent-all', live],
    ]);
    const drift: MenuStructureDrift[] = [{
      name: 'calevent-all', docId: 'calevent-all', forked: false, pinned: ['roleNeeded'],
      fields: { roleNeeded: 'none', url: '/calevent/all' },
      live: { roleNeeded: 'registered', url: '/calevent/all-changed' },
    }];
    const row = base(existing, drift).find(r => r.name === 'calevent-all');
    expect(row).toMatchObject({ state: 'drifted', otherDrift: ['url'] });
  });

  it('keeps an absent subtree nested and offers it as one group', () => {
    // Neither `finance-menu` nor `finance-invoices` exists for this tenant at all. An absent
    // subtree used to be FLATTENED to depth 0, on the reasoning that a row under a missing
    // parent is unreachable anyway. It is not flattened any more: the parent now carries a
    // `groupKeys` closure over its own absent subtree, so one «Ins Menü» attaches the whole
    // small feature — and a group the admin is asked to add as a unit has to be shown as one.
    const existing = new Map([['main_scs', doc('main_scs', [])]]);
    const rows = base(existing, [], [FINANCE]);
    expect(rows.map(r => [r.name, r.state, r.depth])).toEqual([
      ['finance-menu', 'absent', 0],
      ['finance-invoices', 'absent', 1],
    ]);
    expect(rows[0].groupKeys).toEqual(['finance-menu', 'finance-invoices']);
    expect(rows[1].groupKeys).toEqual(['finance-invoices']);
  });

  it('does not duplicate a row that is both live elsewhere and a catalogue child', () => {
    // `calevent-all` is attached directly under the root (flat), not nested under
    // `event-menu` as the catalogue expects. It must be reported once, as the live row it
    // is — never a second time as an absent child of `event-menu`.
    const existing = new Map([
      ['main_scs', doc('main_scs', ['calevent-all'])],
      ['calevent-all', doc('calevent-all')],
    ]);
    const rows = base(existing);
    expect(rows.filter(r => r.name === 'calevent-all')).toHaveLength(1);
    expect(rows.find(r => r.name === 'calevent-all')).toMatchObject({ state: 'equal', depth: 0 });
  });
});

/** A page whose url names its context menu, that menu, and one action inside it — the shape
 *  every list screen in the catalogue has, and the one the root walk alone could not see. */
const TASK: FeatureBlock = {
  id: 'task', bundle: 'special', label: 'Aufgaben', icon: 'task',
  defaultAvailability: 'ga', dependsOn: [], collections: [],
  menu: [
    { key: 'task-all', name: 'task-all', url: '/task/all/c-tasks', action: 'navigate',
      roleNeeded: 'none', icon: 'task', label: '@item.task-all' },
    { key: 'c-tasks', name: 'c-tasks', url: '', action: 'context', roleNeeded: 'none',
      icon: 'help-circle', label: '', children: [
        { key: 'task-add', name: 'task-add', url: 'add', action: 'call', roleNeeded: 'none',
          icon: 'add-circle', label: '@item.task-add' },
      ] },
  ],
};

describe('buildMenuTree — identity, not reachability', () => {
  it('reports a context menu the tenant HAS as live, nested under the page whose url names it', () => {
    // A context menu is never a child of the root menu — it is resolved from `task-all`'s url.
    // Deriving the state from the root walk alone reported it (and its actions) as `absent`,
    // so the table offered «Ins Menü» on documents the tenant already had and the server
    // answered "es gibt nichts zu übernehmen".
    const existing = new Map([
      ['main_scs', doc('main_scs', ['task-all'])],
      ['task-all', doc('task-all')],
      ['c-tasks', doc('c-tasks', ['task-add'])],
      ['task-add', doc('task-add')],
    ]);
    const rows = buildMenuTree({ rootKey: 'main_scs', existing, drift: [], enabledBlocks: [TASK] });
    expect(rows.map(r => [r.name, r.state, r.depth])).toEqual([
      ['task-all', 'equal', 0],
      ['c-tasks', 'equal', 1],
      ['task-add', 'equal', 2],
    ]);
    expect(rows.every(r => r.groupKeys.length === 0)).toBe(true);
  });

  it('offers a page together with its context menu and actions as one group', () => {
    const existing = new Map([['main_scs', doc('main_scs', [])]]);
    const rows = buildMenuTree({ rootKey: 'main_scs', existing, drift: [], enabledBlocks: [TASK] });
    expect(rows.map(r => [r.name, r.state, r.depth])).toEqual([
      ['task-all', 'absent', 0],
      ['c-tasks', 'absent', 1],
      ['task-add', 'absent', 2],
    ]);
    expect(rows[0].groupKeys).toEqual(['task-all', 'c-tasks', 'task-add']);
  });

  it('reports a name a live parent lists but whose own document this tenant lacks as absent', () => {
    // The yellow «Missing: calevent-my» in the sidebar. This used to be swallowed as a
    // "dangling reference", so the one screen that could repair it never listed the row.
    const existing = new Map([
      ['main_scs', doc('main_scs', ['event-menu'])],
      ['event-menu', doc('event-menu', ['calevent-all', 'calevent-my'])],
      ['calevent-all', doc('calevent-all')],
    ]);
    const rows = base(existing);
    expect(rows.find(r => r.name === 'calevent-my'))
      .toMatchObject({ state: 'absent', depth: 1, docId: '', groupKeys: ['calevent-my'] });
  });

  it('shows nothing for a dangling name no catalogue block declares', () => {
    const existing = new Map([
      ['main_scs', doc('main_scs', ['event-menu'])],
      ['event-menu', doc('event-menu', ['ghost-row'])],
    ]);
    expect(base(existing).map(r => r.name)).not.toContain('ghost-row');
  });
});

describe('filterMenuRows', () => {
  const rows = buildMenuTree({
    rootKey: 'main_scs',
    existing: new Map([['main_scs', doc('main_scs', [])]]),
    drift: [], enabledBlocks: [TASK],
  });

  it('returns the list untouched when neither filter is set', () => {
    expect(filterMenuRows(rows, '', 'all')).toBe(rows);
    expect(filterMenuRows(rows, '  ', '')).toBe(rows);
  });

  it('keeps a match together with its ancestors so the indentation still reads as a tree', () => {
    expect(filterMenuRows(rows, 'task-add', 'all').map(r => r.name))
      .toEqual(['task-all', 'c-tasks', 'task-add']);
  });

  it('filters by menu action and matches the name case-insensitively', () => {
    expect(filterMenuRows(rows, '', 'context').map(r => r.name)).toEqual(['task-all', 'c-tasks']);
    expect(filterMenuRows(rows, 'TASK-ALL', 'all').map(r => r.name)).toEqual(['task-all']);
  });

  it('returns nothing when both filters cannot be satisfied at once', () => {
    expect(filterMenuRows(rows, 'task-add', 'navigate')).toEqual([]);
  });
});
