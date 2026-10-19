import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS, collectMenuUrls, composeFeatureRoutes, urlResolves } from '@okr/tenant-util';
import { FEATURE_ROUTES } from './feature-catalogue';
import { UNGATED_ROUTES } from './ungated-routes';

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    // UNGATED_ROUTES: catalogued menu rows may point at a control-plane screen that is
    // deliberately outside FEATURE_ROUTES (the feature picker). It still has to resolve.
    const routes = [...composeFeatureRoutes(FEATURE_ROUTES), ...UNGATED_ROUTES];
    // TRANSITIONAL (spec 1.101 phase 2, Task 2): Wartung rows are catalogued before their pages;
    // Tasks 6-9 add each route and delete its entry. Empty by the end of the branch.
    const pending = ['/document/orphans', '/trips/maintenance', '/diary/import'];
    const unresolved = collectMenuUrls(FEATURE_BLOCKS).filter(u => !pending.includes(u) && !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});

describe('content integrity route (spec 1.101 phase 2)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the old /aoc/content url redirects to /page/integrity', () => {
    const aoc = child(blockRoutes('aoc'), 'aoc').find(r => r.path === 'content');
    expect(aoc?.redirectTo).toBe('/page/integrity');
    expect(aoc?.loadComponent).toBeUndefined();
  });

  it('the page block has the integrity path ahead of the :listId catch-all', () => {
    const paths = child(blockRoutes('cms'), 'page').map(r => r.path);
    expect(paths).toContain('integrity');
    expect(paths.indexOf('integrity')).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
  });
});
