import { describe, expect, it } from 'vitest';
import { MenuItemModel } from '@okr/shared-models';
import { planMenuOps, STRUCTURAL_FIELDS } from './menu-seed.util';
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
});
