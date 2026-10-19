import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS, collectMenuUrls, composeFeatureRoutes, urlResolves } from '@okr/tenant-util';
import { FEATURE_ROUTES } from './feature-catalogue';
import { UNGATED_ROUTES } from './ungated-routes';

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    // UNGATED_ROUTES: catalogued menu rows may point at a control-plane screen that is
    // deliberately outside FEATURE_ROUTES (the feature picker). It still has to resolve.
    const routes = [...composeFeatureRoutes(FEATURE_ROUTES), ...UNGATED_ROUTES];
    const unresolved = collectMenuUrls(FEATURE_BLOCKS).filter(u => !urlResolves(routes, u));
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

describe('document orphans route (spec 1.101 phase 2)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the old /aoc/doc url redirects to /document/orphans', () => {
    const aoc = child(blockRoutes('aoc'), 'aoc').find(r => r.path === 'doc');
    expect(aoc?.redirectTo).toBe('/document/orphans');
    expect(aoc?.loadComponent).toBeUndefined();
  });

  it('the document block has the orphans path ahead of the :listId catch-all, behind an admin guard', () => {
    const children = child(blockRoutes('document'), 'document');
    const paths = children.map(r => r.path);
    expect(paths).toContain('orphans');
    expect(paths.indexOf('orphans')).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
    expect(children.find(r => r.path === 'orphans')?.canActivate).toHaveLength(1);
  });
});

describe('trip maintenance and diary import routes (spec 1.101 phase 2)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the old /aoc/trip and /aoc/diary urls redirect to their new homes', () => {
    const aoc = child(blockRoutes('aoc'), 'aoc');
    const trip = aoc.find(r => r.path === 'trip');
    const diary = aoc.find(r => r.path === 'diary');
    expect(trip?.redirectTo).toBe('/trips/maintenance');
    expect(trip?.loadComponent).toBeUndefined();
    expect(diary?.redirectTo).toBe('/diary/import');
    expect(diary?.loadComponent).toBeUndefined();
  });

  it.each([
    ['trip', 'trips', 'maintenance'],
    ['diary', 'diary', 'import'],
  ])('the %s block has %s/%s ahead of the :listId catch-all, behind one guard', (block, root, path) => {
    const children = child(blockRoutes(block), root);
    const paths = children.map(r => r.path);
    expect(paths).toContain(path);
    expect(paths.indexOf(path)).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
    expect(children.find(r => r.path === path)?.canActivate).toHaveLength(1);
  });
});
