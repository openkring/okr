import { describe, expect, it } from 'vitest';
import { MenuItemModel } from '@okr/shared-models';
import { indexMenuDocsByName, menuSpecNames, planMenuOps, STRUCTURAL_FIELDS } from './menu-seed.util';
import type { MenuSpec } from './feature-catalogue.types';

const spec: MenuSpec = {
  key: 'calevent-all', name: 'calevent-all', url: '/calevent/all/c-calevents',
  action: 'navigate', roleNeeded: 'registered', icon: 'calendar', label: '@main.calevent.all',
};

const existingDoc = (over: Partial<MenuItemModel> = {}): MenuItemModel => {
  const doc = new MenuItemModel('scs');
  return Object.assign(doc, {
    okey: 'calevent-all', name: 'calevent-all', url: '/calevent/all/c-calevents',
    action: 'navigate', roleNeeded: 'registered', icon: 'calendar',
    label: '@main.calevent.all', tenants: ['scs'],
  }, over);
};

describe('planMenuOps', () => {
  it('creates a missing doc with both structural and presentational fields', () => {
    const ops = planMenuOps([spec], 'p13', new Map());
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('create');
    expect(ops[0].fields.url).toBe('/calevent/all/c-calevents');
    expect(ops[0].fields.label).toBe('@main.calevent.all');
    expect(ops[0].fields.tenants).toEqual(['p13']);
  });

  it('a created doc carries isArchived:false and a real index (task-8 review round 3, Important 3)', () => {
    // Without these, MenuService.list()/.read() — which query `where('isArchived','==',
    // false)` — never see the doc: Firestore's `==` excludes documents MISSING the field
    // entirely, it does not treat a missing field as `false`. A created child menu doc
    // would otherwise be permanently invisible to the app.
    const ops = planMenuOps([spec], 'p13', new Map());
    expect(ops[0].fields.isArchived).toBe(false);
    expect(ops[0].fields.index).toBe('n:calevent-all a:navigate k:calevent-all');
  });

  it('adds the tenant to an existing shared doc without duplicating it', () => {
    const existing = new Map([['calevent-all', existingDoc()]]);
    const ops = planMenuOps([spec], 'p13', existing);
    expect(ops[0].op).toBe('add-tenant');
    expect(ops[0].fields.tenants).toEqual(['scs', 'p13']);
  });

  it('is a no-op when the tenant is already listed and nothing changed', () => {
    const existing = new Map([['calevent-all', existingDoc({ tenants: ['scs', 'p13'] })]]);
    expect(planMenuOps([spec], 'p13', existing)).toEqual([]);
  });

  it('rewrites a drifted structural field (D-BB-7)', () => {
    const existing = new Map([['calevent-all', existingDoc({ tenants: ['p13'], url: '/OLD/url' })]]);
    const ops = planMenuOps([spec], 'p13', existing);
    expect(ops[0].op).toBe('update-structure');
    expect(ops[0].fields.url).toBe('/calevent/all/c-calevents');
  });

  it('never rewrites a tenant-owned presentational field (D-BB-7)', () => {
    const existing = new Map([['calevent-all', existingDoc({
      tenants: ['p13'], url: '/OLD/url', label: 'Anlässe', icon: 'ticket',
    })]]);
    const ops = planMenuOps([spec], 'p13', existing);
    expect(ops[0].fields.url).toBe('/calevent/all/c-calevents');
    expect(ops[0].fields.label).toBeUndefined();
    expect(ops[0].fields.icon).toBeUndefined();
  });

  it('appends missing children to a parent without reordering existing ones', () => {
    const parentSpec: MenuSpec = {
      key: 'main', name: 'main', url: '', action: 'sub', roleNeeded: 'registered',
      icon: 'menu', label: '@main.root', children: [spec],
    };
    const parent = Object.assign(new MenuItemModel('p13'), {
      okey: 'main', name: 'main', action: 'sub', tenants: ['p13'],
      menuItems: ['dashboard', 'album'],
    });
    const ops = planMenuOps([parentSpec], 'p13', new Map([['main', parent]]));
    const parentOp = ops.find(o => o.key === 'main');
    expect(parentOp?.fields.menuItems).toEqual(['dashboard', 'album', 'calevent-all']);
  });

  it('recurses into children', () => {
    const parentSpec: MenuSpec = {
      key: 'main', name: 'main', url: '', action: 'sub', roleNeeded: 'registered',
      icon: 'menu', label: '@main.root', children: [spec],
    };
    const ops = planMenuOps([parentSpec], 'p13', new Map());
    expect(ops.map(o => o.key).sort()).toEqual(['calevent-all', 'main']);
  });

  it('detects drift for each structural field independently', () => {
    for (const field of STRUCTURAL_FIELDS) {
      const overrides: Partial<MenuItemModel> = { tenants: ['p13'] };
      overrides[field as keyof MenuItemModel] = '/OLD/value' as never;
      const existing = new Map([['calevent-all', existingDoc(overrides)]]);
      const ops = planMenuOps([spec], 'p13', existing);
      expect(ops).toHaveLength(1);
      expect(ops[0].op).toBe('update-structure');
      expect(ops[0].fields[field as keyof MenuItemModel]).toBeDefined();
    }
  });

  it('handles a doc with undefined tenants from raw Firestore read', () => {
    const doc = new MenuItemModel('scs');
    Object.assign(doc, {
      okey: 'calevent-all', name: 'calevent-all', url: '/calevent/all/c-calevents',
      action: 'navigate', roleNeeded: 'registered', icon: 'calendar',
      label: '@main.calevent.all', tenants: undefined,
    });
    const existing = new Map([['calevent-all', doc]]);
    const ops = planMenuOps([spec], 'p13', existing);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('add-tenant');
    expect(ops[0].fields.tenants).toEqual(['p13']);
  });

  // ──────────────────────────────────────────────────────────────────────────────────
  // `docId` (task 12 review round 2, repo owner ruling): eleven live `menuItems` docs
  // carry legacy autoids that differ from their `name` (e.g. `icon-all`'s real doc id is
  // `ogwzpl15fpuhcxon5e7b`). `existing`/`existingByName` MUST be indexed by name (see
  // `indexMenuDocsByName`), and the op's write target (`docId`) must be the EXISTING doc's
  // real id when one is found — never `spec.key`, or every seed against such a doc would
  // silently create a SECOND, duplicate `menuItems` doc under the catalogue key instead of
  // updating the original.
  // ──────────────────────────────────────────────────────────────────────────────────
  it('resolves an existing doc by name even when its doc id is a legacy autoid, and targets that REAL doc id for the write', () => {
    const legacyDoc = existingDoc({ okey: 'ogwzpl15fpuhcxon5e7b', tenants: ['scs'] });
    const existing = new Map([['calevent-all', legacyDoc]]); // indexed by NAME, per indexMenuDocsByName
    const ops = planMenuOps([spec], 'p13', existing);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('add-tenant'); // recognized as an existing doc, NOT 'create'
    expect(ops[0].key).toBe('calevent-all'); // catalogue identity unaffected
    expect(ops[0].docId).toBe('ogwzpl15fpuhcxon5e7b'); // write targets the REAL doc, not a new one
  });

  it('a freshly created doc still gets docId === key === name, with okey unchanged (D-BB behaviour preserved)', () => {
    const ops = planMenuOps([spec], 'p13', new Map());
    expect(ops[0].docId).toBe('calevent-all');
    expect(ops[0].key).toBe('calevent-all');
    expect(ops[0].fields.okey).toBe('calevent-all');
  });
});

describe('indexMenuDocsByName', () => {
  it('indexes by the name field, not the Firestore doc id', () => {
    const { byName } = indexMenuDocsByName([
      { id: 'ogwzpl15fpuhcxon5e7b', data: { name: 'icon-all' } },
    ], 'p13');
    expect(byName.get('icon-all')?.okey).toBe('ogwzpl15fpuhcxon5e7b');
    expect(byName.has('ogwzpl15fpuhcxon5e7b')).toBe(false);
  });

  it('falls back to the doc id when the data has no name field', () => {
    const { byName } = indexMenuDocsByName([{ id: 'some-id', data: {} }], 'p13');
    expect(byName.has('some-id')).toBe(true);
  });

  it('reports a name shared by two docs instead of silently picking one', () => {
    const { ambiguous } = indexMenuDocsByName([
      { id: 'id-a', data: { name: 'icon-sync' } },
      { id: 'id-b', data: { name: 'icon-sync' } },
    ], 'p13');
    expect(ambiguous).toEqual([{ name: 'icon-sync', ids: ['id-a', 'id-b'] }]);
  });

  it('reports nothing ambiguous when every name is unique', () => {
    const { ambiguous } = indexMenuDocsByName([
      { id: 'id-a', data: { name: 'a' } },
      { id: 'id-b', data: { name: 'b' } },
    ], 'p13');
    expect(ambiguous).toEqual([]);
  });

  it('never lets a stored okey field override the REAL Firestore doc id (task 12 review round 3)', () => {
    // The convention is to strip `okey` before write, but nothing on the read path
    // enforces that — a doc that somehow carries its own (possibly stale) `okey` field
    // must not have it override `id`, since `docId` (planMenuOps) is a downstream WRITE
    // target: a wrong `okey` here would silently redirect a write to the wrong document.
    const { byName } = indexMenuDocsByName([
      { id: 'real-doc-id', data: { name: 'icon-all', okey: 'stale-or-wrong-id' } },
    ], 'p13');
    expect(byName.get('icon-all')?.okey).toBe('real-doc-id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Task B-1 — the per-tenant resolution ladder. Every fixture below mirrors a document
// that exists in production (verified against Firestore 2026-08-04); the field values are
// copied from the live docs, not invented.
// ─────────────────────────────────────────────────────────────────────────────────────
describe('indexMenuDocsByName — per-tenant collision resolution (task B-1)', () => {
  type LiveDoc = { id: string; data: Partial<MenuItemModel> };

  /** `menuItems/filter-toggle` (archived) + `menuItems/zjbhk84hfrfc32yb6td5` (active). */
  const filterToggleDocs: LiveDoc[] = [
    { id: 'filter-toggle', data: { name: 'filter-toggle', action: 'call', url: 'toggleFilter', roleNeeded: 'registered', tenants: ['scs'], isArchived: true } },
    { id: 'zjbhk84hfrfc32yb6td5', data: { name: 'filter-toggle', action: 'toggle', url: 'toggleFilter', roleNeeded: 'contentAdmin', tenants: ['scs'], isArchived: false } },
  ];

  /** `menuItems/resource-menu` (`['test']`) + `menuItems/resource-menu-scs` (`['scs']`). */
  const resourceMenuDocs: LiveDoc[] = [
    { id: 'resource-menu', data: { name: 'resource-menu', action: 'sub', tenants: ['test'], isArchived: false, menuItems: ['resource-all', 'rboat-all', 'ownerships-all'] } },
    { id: 'resource-menu-scs', data: { name: 'resource-menu', action: 'sub', tenants: ['scs'], isArchived: false, menuItems: ['resource-all', 'lockers-all', 'res-misc'] } },
  ];

  /** `menuItems/event-menu` + `menuItems/info_menu`, byte-identical, both `['test']`. */
  const eventMenuDocs: LiveDoc[] = [
    { id: 'info_menu', data: { name: 'event-menu', action: 'sub', tenants: ['test'], isArchived: false } },
    { id: 'event-menu', data: { name: 'event-menu', action: 'sub', tenants: ['test'], isArchived: false } },
  ];

  it('archived + active twin: resolves to the ACTIVE doc, for the tenant both name', () => {
    const { byName, ambiguous } = indexMenuDocsByName(filterToggleDocs, 'scs');
    expect(byName.get('filter-toggle')?.okey).toBe('zjbhk84hfrfc32yb6td5');
    // Not merely "an entry exists": it must be the toggle version, i.e. the ladder picked
    // the live doc rather than the stale `action: 'call'` one whose id happens to be nicer.
    expect(byName.get('filter-toggle')?.action).toBe('toggle');
    expect(ambiguous).toEqual([]);
  });

  it('archived + active twin: still resolves to the ACTIVE doc for a tenant neither names', () => {
    const { byName, ambiguous } = indexMenuDocsByName(filterToggleDocs, 'p13');
    expect(byName.get('filter-toggle')?.okey).toBe('zjbhk84hfrfc32yb6td5');
    expect(ambiguous).toEqual([]);
  });

  it('a name whose only doc is archived is ABSENT from the index (→ create path), not resolved to the archived doc', () => {
    const { byName, ambiguous } = indexMenuDocsByName([filterToggleDocs[0]], 'scs');
    expect(byName.has('filter-toggle')).toBe(false);
    expect(ambiguous).toEqual([]);
  });

  it('generic + tenant-bespoke: scs gets the bespoke doc (rung 3 beats rung 4)', () => {
    const { byName, ambiguous } = indexMenuDocsByName(resourceMenuDocs, 'scs');
    expect(byName.get('resource-menu')?.okey).toBe('resource-menu-scs');
    // Rung 4 (id === name) would have said `resource-menu`; membership must win, or scs's
    // 6-child bespoke subtree would be seeded onto test's 9-child generic doc.
    expect(byName.get('resource-menu')?.menuItems).toEqual(['resource-all', 'lockers-all', 'res-misc']);
    expect(ambiguous).toEqual([]);
  });

  it('generic + tenant-bespoke: test gets the generic doc', () => {
    const { byName, ambiguous } = indexMenuDocsByName(resourceMenuDocs, 'test');
    expect(byName.get('resource-menu')?.okey).toBe('resource-menu');
    expect(byName.get('resource-menu')?.menuItems).toEqual(['resource-all', 'rboat-all', 'ownerships-all']);
    expect(ambiguous).toEqual([]);
  });

  it('generic + tenant-bespoke: a third tenant that inherits NEITHER falls back to the generic doc (rung 4)', () => {
    const { byName, ambiguous } = indexMenuDocsByName(resourceMenuDocs, 'p13');
    expect(byName.get('resource-menu')?.okey).toBe('resource-menu');
    expect(ambiguous).toEqual([]);
  });

  it('byte-identical twins both naming the tenant: resolved by document id, whatever order Firestore lists them in', () => {
    // `info_menu` is listed FIRST here on purpose — first-seen (the pre-fix tie-break)
    // would pick the stale twin. Rung 3 cannot separate them (both carry `test`), so
    // rung 4 must, and it must not depend on iteration order.
    const { byName, ambiguous } = indexMenuDocsByName(eventMenuDocs, 'test');
    expect(byName.get('event-menu')?.okey).toBe('event-menu');
    expect(ambiguous).toEqual([]);
  });

  it('still refuses when the ladder genuinely cannot decide, and names the surviving candidates', () => {
    // Two active legacy-autoid docs, neither naming this tenant, neither id === name:
    // nothing distinguishes them, so this must stay a refusal rather than a coin flip.
    const { ambiguous } = indexMenuDocsByName([
      { id: 'legacy-id-a', data: { name: 'icon-sync', tenants: ['scs'], isArchived: false } },
      { id: 'legacy-id-b', data: { name: 'icon-sync', tenants: ['test'], isArchived: false } },
    ], 'p13');
    expect(ambiguous).toEqual([{ name: 'icon-sync', ids: ['legacy-id-a', 'legacy-id-b'] }]);
  });

  it('an archived third twin is not listed among the candidates of an ambiguous name', () => {
    const { ambiguous } = indexMenuDocsByName([
      { id: 'legacy-id-a', data: { name: 'icon-sync', tenants: ['scs'], isArchived: false } },
      { id: 'legacy-id-b', data: { name: 'icon-sync', tenants: ['test'], isArchived: false } },
      { id: 'legacy-id-c', data: { name: 'icon-sync', tenants: ['test'], isArchived: true } },
    ], 'p13');
    expect(ambiguous).toEqual([{ name: 'icon-sync', ids: ['legacy-id-a', 'legacy-id-b'] }]);
  });

  it('two docs BOTH naming the tenant and neither generic stays ambiguous — rung 4 does not rescue an undecidable pair', () => {
    const { ambiguous } = indexMenuDocsByName([
      { id: 'aoc-menu-scs', data: { name: 'aoc-menu', tenants: ['scs'], isArchived: false } },
      { id: 'aoc-menu-legacy', data: { name: 'aoc-menu', tenants: ['scs'], isArchived: false } },
    ], 'scs');
    expect(ambiguous).toEqual([{ name: 'aoc-menu', ids: ['aoc-menu-scs', 'aoc-menu-legacy'] }]);
  });

  it('a doc MISSING isArchived is treated as live, not as archived (would otherwise create a second doc under that name)', () => {
    const { byName, ambiguous } = indexMenuDocsByName([
      { id: 'legacy-no-flag', data: { name: 'icon-sync', tenants: ['scs'] } },
    ], 'scs');
    expect(byName.get('icon-sync')?.okey).toBe('legacy-no-flag');
    expect(ambiguous).toEqual([]);
  });
});

describe('menuSpecNames', () => {
  it('collects nested child names, not just top-level ones', () => {
    const tree: MenuSpec[] = [{
      key: 'c-icon', name: 'c-icon', url: '', action: 'context', roleNeeded: 'contentAdmin',
      icon: 'help-circle', label: '', children: [{
        key: 'icon-add', name: 'icon-add', url: 'add', action: 'call',
        roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Icon hinzufügen',
        children: [{
          key: 'icon-add-deep', name: 'icon-add-deep', url: 'deep', action: 'call',
          roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'tiefer',
        }],
      }],
    }];
    expect(menuSpecNames(tree)).toEqual(['c-icon', 'icon-add', 'icon-add-deep']);
  });

  it('is empty for a block with no menu at all', () => {
    expect(menuSpecNames([])).toEqual([]);
  });
});
