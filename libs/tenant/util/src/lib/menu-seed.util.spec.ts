import { describe, expect, it } from 'vitest';
import { MenuItemModel } from '@okr/shared-models';
import { indexMenuDocsByName, planMenuOps, STRUCTURAL_FIELDS } from './menu-seed.util';
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
    ]);
    expect(byName.get('icon-all')?.okey).toBe('ogwzpl15fpuhcxon5e7b');
    expect(byName.has('ogwzpl15fpuhcxon5e7b')).toBe(false);
  });

  it('falls back to the doc id when the data has no name field', () => {
    const { byName } = indexMenuDocsByName([{ id: 'some-id', data: {} }]);
    expect(byName.has('some-id')).toBe(true);
  });

  it('reports a name shared by two docs instead of silently picking one', () => {
    const { duplicates } = indexMenuDocsByName([
      { id: 'id-a', data: { name: 'icon-sync' } },
      { id: 'id-b', data: { name: 'icon-sync' } },
    ]);
    expect(duplicates).toEqual([{ name: 'icon-sync', ids: ['id-a', 'id-b'] }]);
  });

  it('reports no duplicates when every name is unique', () => {
    const { duplicates } = indexMenuDocsByName([
      { id: 'id-a', data: { name: 'a' } },
      { id: 'id-b', data: { name: 'b' } },
    ]);
    expect(duplicates).toEqual([]);
  });

  it('never lets a stored okey field override the REAL Firestore doc id (task 12 review round 3)', () => {
    // The convention is to strip `okey` before write, but nothing on the read path
    // enforces that — a doc that somehow carries its own (possibly stale) `okey` field
    // must not have it override `id`, since `docId` (planMenuOps) is a downstream WRITE
    // target: a wrong `okey` here would silently redirect a write to the wrong document.
    const { byName } = indexMenuDocsByName([
      { id: 'real-doc-id', data: { name: 'icon-all', okey: 'stale-or-wrong-id' } },
    ]);
    expect(byName.get('icon-all')?.okey).toBe('real-doc-id');
  });
});
