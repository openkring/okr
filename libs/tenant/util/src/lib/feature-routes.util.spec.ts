import { describe, expect, it } from 'vitest';
import { composeFeatureRoutes, urlResolves } from './feature-routes.util';
import type { RouteSource } from './feature-routes.util';

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
