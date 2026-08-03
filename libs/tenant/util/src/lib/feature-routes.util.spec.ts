import { describe, expect, it } from 'vitest';
import { blockOfMenuKey, collectMenuUrls, composeFeatureRoutes, urlResolves } from './feature-routes.util';
import type { RouteSource } from './feature-routes.util';
import type { FeatureBlock } from './feature-catalogue.types';

const routeSource = (routes: RouteSource['routes']): RouteSource => ({ routes });

describe('composeFeatureRoutes', () => {
  it('concatenates every block route fragment', () => {
    const routes = composeFeatureRoutes([
      routeSource(() => [{ path: 'a' }]),
      routeSource(() => [{ path: 'b' }]),
    ]);
    expect(routes.map(r => r.path)).toEqual(['a', 'b']);
  });
});

describe('urlResolves', () => {
  const routes = composeFeatureRoutes([
    routeSource(() => [{ path: 'calevent', children: [{ path: ':listId/:ctx' }] }]),
    routeSource(() => [{ path: 'aoc', children: [{ path: 'roles' }] }]),
  ]);

  it('matches a literal segment', () => {
    expect(urlResolves(routes, '/aoc/roles')).toBe(true);
  });

  it('matches a parameterised segment', () => {
    expect(urlResolves(routes, '/calevent/all/c-calevents')).toBe(true);
  });

  it('rejects a url with no matching route', () => {
    expect(urlResolves(routes, '/invoice/all')).toBe(false);
  });

  it('rejects a url deeper than the route tree', () => {
    expect(urlResolves(routes, '/aoc/roles/extra')).toBe(false);
  });

  it('ignores an empty url (sub/context menu entries carry none)', () => {
    expect(urlResolves(routes, '')).toBe(true);
  });
});

/**
 * Pins the fix for a real regression (task 12, repo owner ruling 2026-08-03): a `call`/
 * `toggle` `MenuSpec`'s `url` is an action verb read verbatim off the live `menuItems`
 * Firestore doc (e.g. `'add'`, `'exportRaw'`, `'toggleEditMode'`), not a router path.
 * `collectMenuUrls` must skip it — both because it is not a route to check, and because
 * `menu-seed.util.ts` rewrites `url` (a `STRUCTURAL_FIELD`) on every seed, so a catalogue
 * author "fixing" a route-coverage failure by blanking a `call` entry's `url` instead of
 * excluding it here would ship an empty action verb to a live tenant's menu doc on the
 * next seed, breaking that button. Without this test, the next person hits the same
 * red route-coverage test and is tempted to blank the url again instead of filtering here.
 */
describe('collectMenuUrls', () => {
  const catalogue: FeatureBlock[] = [{
    id: 'widget', bundle: 'core', label: '@f.widget', icon: 'admin', core: true,
    defaultAvailability: 'ga', dependsOn: [], collections: [],
    menu: [
      { key: 'widget-all', name: 'widget-all', url: '/widget/all', action: 'navigate', roleNeeded: 'admin', icon: 'admin', label: 'Widgets' },
      { key: 'c-widget', name: 'c-widget', url: '', action: 'context', roleNeeded: 'admin', icon: 'help-circle', label: '', children: [
        // 'add' is an action verb the list component dispatches on — not a route, even
        // though it is a non-empty `url`.
        { key: 'widget-add', name: 'widget-add', url: 'add', action: 'call', roleNeeded: 'admin', icon: 'add-circle', label: 'Add' },
        { key: 'widget-toggle', name: 'widget-toggle', url: 'toggleEditMode', action: 'toggle', roleNeeded: 'admin', icon: 'edit', label: 'Toggle' },
      ] },
    ],
  }];

  it('collects the url of a navigate entry', () => {
    expect(collectMenuUrls(catalogue)).toContain('/widget/all');
  });

  it('excludes a call entry\'s non-route action-verb url', () => {
    expect(collectMenuUrls(catalogue)).not.toContain('add');
  });

  it('excludes a toggle entry\'s non-route action-verb url', () => {
    expect(collectMenuUrls(catalogue)).not.toContain('toggleEditMode');
  });

  it('does not fail route-coverage over an unroutable call/toggle url', () => {
    // No route ships an 'add' or 'toggleEditMode' path anywhere — if collectMenuUrls
    // leaked those, this composed (near-empty) route table would fail to resolve them.
    const routes = composeFeatureRoutes([routeSource(() => [{ path: 'widget', children: [{ path: 'all' }] }])]);
    const unresolved = collectMenuUrls(catalogue).filter(u => !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});

// Local fixture, deliberately not the real FEATURE_BLOCKS: tasks 12-18 add ~29 more blocks
// to that catalogue, and a test asserting against it would churn on every one of them.
// Keep the nested `aoc-storage` case — it proves the recursion into `children` works.
const localCatalogue: FeatureBlock[] = [{
  id: 'aoc', bundle: 'special', label: '@f.aoc', icon: 'admin',
  defaultAvailability: 'ga', dependsOn: [], collections: [],
  menu: [{
    key: 'aoc-menu', name: 'aoc-menu', url: '', action: 'sub',
    roleNeeded: 'admin', icon: 'admin', label: 'AOC',
    children: [{
      key: 'aoc-storage', name: 'aoc-storage', url: '/aoc/storage', action: 'navigate',
      roleNeeded: 'admin', icon: 'documents', label: 'Storage',
    }],
  }],
}];

describe('blockOfMenuKey', () => {
  it('finds the owning block for a nested menu key', () => {
    expect(blockOfMenuKey(localCatalogue, 'aoc-storage')).toBe('aoc');
  });

  it('returns undefined for a tenant-authored key', () => {
    expect(blockOfMenuKey(localCatalogue, 'my-custom-link')).toBeUndefined();
  });
});
