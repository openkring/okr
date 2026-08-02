import { describe, expect, it } from 'vitest';
import { collectMenuUrls, composeFeatureRoutes, urlResolves } from './feature-routes.util';
import { FEATURE_CATALOGUE } from './feature-catalogue';
import type { FeatureBlock } from './feature-catalogue.types';

const block = (id: string, over: Partial<FeatureBlock>): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn: [], routes: () => [], menu: [], collections: [],
  ...over,
});

describe('composeFeatureRoutes', () => {
  it('concatenates every block route fragment', () => {
    const routes = composeFeatureRoutes([
      block('a', { routes: () => [{ path: 'a' }] }),
      block('b', { routes: () => [{ path: 'b' }] }),
    ]);
    expect(routes.map(r => r.path)).toEqual(['a', 'b']);
  });
});

describe('urlResolves', () => {
  const routes = composeFeatureRoutes([
    block('a', { routes: () => [{ path: 'calevent', children: [{ path: ':listId/:ctx' }] }] }),
    block('b', { routes: () => [{ path: 'aoc', children: [{ path: 'roles' }] }] }),
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

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    const routes = composeFeatureRoutes(FEATURE_CATALOGUE);
    const unresolved = collectMenuUrls(FEATURE_CATALOGUE).filter(u => !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});
