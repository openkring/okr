import { describe, expect, it } from 'vitest';
import {
  blocksRemovedBySave, comparePlanToDrift, dependentsOf, escapeHtml, menuOutlineOf,
  menuReferencesByName, transitiveDependentsOf,
} from './feature-picker.util';
import type { FeatureBlock, FeatureRollout, MenuSpec } from '@okr/tenant-util';

// `FeatureBlock` (feature-catalogue.types.ts) has no `routes` field — that lives in
// `@okr/tenant-routes`'s `BlockRoutes` now (split out to break a circular dependency, see
// that type's doc comment). The brief's fixture predates the split; build it from the real
// fields only.
const block = (id: string, dependsOn: string[] = [], overrides: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@feature.${id}.label`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn, menu: [], collections: [], ...overrides,
});

describe('dependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('lists blocks that directly depend on the given block', () => {
    expect(dependentsOf(catalogue, 'person').sort()).toEqual(['calevent', 'finance']);
  });

  it('returns only the direct dependent of an intermediate node, not its own dependants', () => {
    // 'esign' depends on 'finance', not on 'person' directly — dependentsOf is one hop only,
    // by design (see its doc comment); the transitive chain is `transitiveDependentsOf`'s job.
    expect(dependentsOf(catalogue, 'finance')).toEqual(['esign']);
  });

  it('returns an empty list for a leaf', () => {
    expect(dependentsOf(catalogue, 'esign')).toEqual([]);
  });
});

describe('transitiveDependentsOf', () => {
  const catalogue = [
    block('person'), block('calevent', ['person']),
    block('finance', ['person']), block('esign', ['finance']),
  ];

  it('walks the full chain: person -> calevent, finance -> esign', () => {
    expect(transitiveDependentsOf(catalogue, 'person', new Set(['person', 'calevent', 'finance', 'esign'])).sort())
      .toEqual(['calevent', 'esign', 'finance']);
  });

  it('only reports dependants that are currently selected', () => {
    // 'esign' depends on 'finance' but is not ticked — no warning needed for it.
    expect(transitiveDependentsOf(catalogue, 'person', new Set(['person', 'calevent', 'finance'])).sort())
      .toEqual(['calevent', 'finance']);
  });

  it('returns an empty list for a leaf', () => {
    expect(transitiveDependentsOf(catalogue, 'esign', new Set(['person', 'calevent', 'finance', 'esign']))).toEqual([]);
  });
});

describe('blocksRemovedBySave', () => {
  const tenantId = 'tenantX';
  const noRollouts: FeatureRollout[] = [];

  it('case 1 — legacy first save: undefined -> a subset names exactly what is dropped', () => {
    const catalogue = [block('calevent'), block('aoc')];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: undefined, nextEnabled: ['calevent'], tenantId,
    })).toEqual(['aoc']);
  });

  it('case 2 — an unmodified first save (ticking everything already on) is a safe no-op', () => {
    const catalogue = [block('calevent'), block('aoc')];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: undefined, nextEnabled: ['calevent', 'aoc'], tenantId,
    })).toEqual([]);
  });

  it('case 3 — dropping one of two independent blocks names only that one', () => {
    const catalogue = [block('a'), block('b')];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: ['a', 'b'], nextEnabled: ['a'], tenantId,
    })).toEqual(['b']);
  });

  it('case 4 — cascade: dropping a dependency also lists its dependants', () => {
    const catalogue = [block('finance'), block('esign', ['finance'])];
    expect(blocksRemovedBySave({
      catalogue, rollouts: noRollouts, currentEnabled: ['finance', 'esign'], nextEnabled: [], tenantId,
    }).sort()).toEqual(['esign', 'finance']);
  });

  it('case 5 — REGRESSION GUARD: currentEnabled: undefined must NOT behave like []', () => {
    const catalogue = [block('calevent'), block('finance'), block('esign', ['finance'])];
    const input = { catalogue, rollouts: noRollouts, nextEnabled: [] as string[], tenantId };

    // undefined (D-BB-10: no rollout doc yet) means "everything not-internal was on" — saving
    // an empty selection removes all three.
    expect(blocksRemovedBySave({ ...input, currentEnabled: undefined }).sort())
      .toEqual(['calevent', 'esign', 'finance']);

    // A literal [] means "explicitly nothing was on" — saving an empty selection removes
    // nothing. If `effectiveFeatures` (or this function) ever collapsed `undefined` into `[]`,
    // these two assertions would become identical and this test would stop catching it.
    expect(blocksRemovedBySave({ ...input, currentEnabled: [] })).toEqual([]);
  });
});

describe('menuOutlineOf', () => {
  const spec = (key: string, url: string, children?: MenuSpec[]): MenuSpec => ({
    key, name: key, url, action: children ? 'sub' : 'navigate',
    roleNeeded: 'admin', icon: 'help-circle', label: '@item.' + key, children,
  });

  it('flattens the menu tree depth-first, carrying the nesting depth', () => {
    const b = block('resource', [], {
      menu: [spec('resource-menu', '', [spec('boats-club', '/ownership/scsBoats/c-ownership')])],
    });
    expect(menuOutlineOf(b).map(row => [row.depth, row.name, row.url])).toEqual([
      [0, 'resource-menu', ''],
      [1, 'boats-club', '/ownership/scsBoats/c-ownership'],
    ]);
  });

  it('scopes a bare label key the way the rendered menu does', () => {
    const b = block('trip', [], { menu: [spec('trip-all', '/trip/all')] });
    expect(menuOutlineOf(b)[0].labelKey).toBe('@cms/menu/feature.item.trip-all');
  });

  it('leaves an already-scoped label key alone', () => {
    const b = block('trip', [], {
      menu: [{ ...spec('trip-all', '/trip/all'), label: '@system/workflow/feature.plural' }],
    });
    expect(menuOutlineOf(b)[0].labelKey).toBe('@system/workflow/feature.plural');
  });

  it('returns an empty outline for a block with no menu of its own', () => {
    expect(menuOutlineOf(block('avatar'))).toEqual([]);
  });
});

describe('menuReferencesByName', () => {
  const child = (key: string): MenuSpec => ({
    key, name: key, url: '/' + key, action: 'navigate',
    roleNeeded: 'admin', icon: 'help-circle', label: '@item.' + key,
  });
  const parent = (key: string, children: MenuSpec[]): MenuSpec => ({
    key, name: key, url: '', action: 'sub',
    roleNeeded: 'admin', icon: 'help-circle', label: '@item.' + key, children,
  });

  const catalogue = [
    block('calevent', [], { menu: [parent('c-calevents', [child('filter-toggle')])] }),
    block('document', [], { menu: [parent('c-documents', [child('filter-toggle')])] }),
    block('trip', [], { menu: [child('trip-all')] }),
  ];

  it('collects every block that declares the same menu name', () => {
    expect(menuReferencesByName(catalogue).get('filter-toggle')?.blockIds)
      .toEqual(['calevent', 'document']);
  });

  it('collects the parents a name is nested under', () => {
    expect(menuReferencesByName(catalogue).get('filter-toggle')?.parents)
      .toEqual(['c-calevents', 'c-documents']);
  });

  it('leaves a root-nav entry without parents', () => {
    expect(menuReferencesByName(catalogue).get('trip-all')).toEqual({ blockIds: ['trip'], parents: [] });
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that would break out of an alert message', () => {
    expect(escapeHtml('<b>a & "b"</b>')).toBe('&lt;b&gt;a &amp; &quot;b&quot;&lt;/b&gt;');
  });

  it('leaves an ordinary menu name untouched', () => {
    expect(escapeHtml('calevent-export-raw')).toBe('calevent-export-raw');
  });
});

describe('comparePlanToDrift', () => {
  const row = (name: string, docId: string, live: string, catalogue: string) =>
    ({ name, docId, field: 'roleNeeded', live, catalogue });
  const change = (name: string, docId: string, from: string, to: string) =>
    ({ blockId: 'chat', docId, name, field: 'roleNeeded', from, to });

  it('reports nothing when the server plans exactly what the screen shows', () => {
    const rows = [row('c-persons', 'c-persons', 'admin', 'registered')];
    const result = comparePlanToDrift(rows, [change('c-persons', 'c-persons', 'admin', 'registered')]);
    expect(result.unplanned).toEqual([]);
    expect(result.conflicting).toEqual([]);
  });

  // The live 2026-09-06 `contextMenuChat` case: the deployed catalogue still agreed with the
  // live document, so the server planned no write and the row could never clear.
  it('reports a row the server plans no write for', () => {
    const rows = [row('contextMenuChat', 'x3uewsf630nqw3vyassg', 'admin', 'registered')];
    expect(comparePlanToDrift(rows, []).unplanned.map(r => r.name)).toEqual(['contextMenuChat']);
  });

  // The live `c-contentpage` case: both catalogues drift, in opposite directions.
  it('reports a row the server plans a different value for', () => {
    const rows = [row('c-contentpage', 'c-contentpage', 'contentAdmin', 'registered')];
    const result = comparePlanToDrift(rows,
      [change('c-contentpage', 'c-contentpage', 'registered', 'contentAdmin')]);
    expect(result.conflicting).toEqual([{ row: rows[0], serverValue: 'contentAdmin' }]);
    expect(result.unplanned).toEqual([]);
  });

  it('matches on the document id, not the name — eleven live docs are named differently', () => {
    const rows = [row('icon-sync', 'ogwzpl15fpuhcxon5e7b', 'admin', 'registered')];
    const result = comparePlanToDrift(rows,
      [change('icon-sync', 'icon-sync', 'admin', 'registered')]);
    expect(result.unplanned.map(r => r.docId)).toEqual(['ogwzpl15fpuhcxon5e7b']);
  });

  it('passes the server plan through verbatim', () => {
    const planned = [change('a', 'a', 'x', 'y')];
    expect(comparePlanToDrift([], planned).planned).toBe(planned);
  });
});
