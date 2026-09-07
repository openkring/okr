import { describe, expect, it } from 'vitest';
import type { MenuItemModel } from '@okr/shared-models';
import type { FeatureBlock, MenuStructureDrift } from '@okr/tenant-util';
import { buildMenuTree } from './menu-tree.util';

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

  it('cascades an absent row whose catalogue parent is itself absent to the root, at depth 0', () => {
    // Neither `finance-menu` nor `finance-invoices` exists for this tenant at all — per the
    // brief, a missing parent means the child is filed under the root, not nested one level
    // under its (equally missing) parent.
    const existing = new Map([['main_scs', doc('main_scs', [])]]);
    const rows = base(existing, [], [FINANCE]);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'finance-menu', state: 'absent', depth: 0, docId: '' }),
      expect.objectContaining({ name: 'finance-invoices', state: 'absent', depth: 0, docId: '' }),
    ]));
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
