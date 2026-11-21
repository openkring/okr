import { describe, expect, it } from 'vitest';
import type { MenuItemModel } from '@okr/shared-models';
import { planRootMenuOp, rootNavKeys, withTailKeysLast } from './root-menu.util';
import { FEATURE_BLOCKS } from './feature-blocks';

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

describe('the version row always closes the main menu', () => {
  it('is attached by rootNavKeys although it is a browse row', () => {
    expect(rootNavKeys(FEATURE_BLOCKS)).toContain('version');
  });

  it('moves the tail keys behind every other row, keeping the rest in order', () => {
    expect(withTailKeysLast(['a', 'version', 'b'])).toEqual(['a', 'b', 'version']);
    expect(withTailKeysLast(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('puts version last when a new tenant root is created', () => {
    const op = planRootMenuOp('elab', new Map(), ['help', 'version', 'album']);
    expect(op?.fields.menuItems).toEqual(['help', 'album', 'version']);
  });

  it('appends version at the end of an existing root', () => {
    const op = planRootMenuOp('scs', root(['help']), ['version']);
    expect(op?.fields.menuItems).toEqual(['help', 'version']);
  });

  it('keeps version last when later rows are appended', () => {
    const op = planRootMenuOp('scs', root(['help', 'version']), ['calevent-all', 'version']);
    expect(op?.fields.menuItems).toEqual(['help', 'calevent-all', 'version']);
  });

  it('moves a version row that is not last to the end', () => {
    const op = planRootMenuOp('scs', root(['version', 'help']), ['version']);
    expect(op?.fields.menuItems).toEqual(['help', 'version']);
  });

  it('writes nothing when version is already last', () => {
    expect(planRootMenuOp('scs', root(['help', 'version']), ['help', 'version'])).toBeUndefined();
  });
});
