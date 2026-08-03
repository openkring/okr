import { describe, expect, it } from 'vitest';
import { blockOfMenuKey, composeFeatureRoutes, urlResolves } from './feature-routes.util';
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
