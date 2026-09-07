import { describe, expect, it } from 'vitest';
import type { MenuItemModel } from '@okr/shared-models';
import { planRootMenuOp } from './root-menu.util';

const root = (menuItems: string[]) => new Map([['main_scs', {
  okey: 'main_scs', name: 'main_scs', tenants: ['scs'], menuItems, isArchived: false,
} as unknown as MenuItemModel]]);

describe('planRootMenuOp never removes', () => {
  it('appends a missing key and keeps every existing one', () => {
    const op = planRootMenuOp('scs', root(['help', 'logbuch']), ['calevent-all']);
    expect(op?.fields.menuItems).toEqual(['help', 'logbuch', 'calevent-all']);
  });

  it('returns undefined when the key is already attached', () => {
    expect(planRootMenuOp('scs', root(['help']), ['help'])).toBeUndefined();
  });

  it('returns undefined when the key is reachable below the root', () => {
    const existing = root(['event-menu']);
    existing.set('event-menu', {
      okey: 'event-menu', name: 'event-menu', tenants: ['scs'],
      menuItems: ['calevent-all'], isArchived: false,
    } as unknown as MenuItemModel);
    expect(planRootMenuOp('scs', existing, ['calevent-all'])).toBeUndefined();
  });

  it('creates the root document for a tenant that has none', () => {
    const op = planRootMenuOp('elab', new Map(), ['help']);
    expect(op?.op).toBe('create');
    expect(op?.fields.menuItems).toEqual(['help']);
    expect(op?.fields.tenants).toEqual(['elab']);
  });
});
