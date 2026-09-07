import { describe, expect, it } from 'vitest';
import { menuOutlineOf } from './menu-outline.util';
import type { FeatureBlock, MenuSpec } from './feature-catalogue.types';

const block = (id: string, dependsOn: string[] = [], overrides: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@feature.${id}.label`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn, menu: [], collections: [], ...overrides,
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
