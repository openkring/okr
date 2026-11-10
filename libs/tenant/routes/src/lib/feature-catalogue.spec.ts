import { describe, expect, it } from 'vitest';
import { FEATURE_BLOCKS, collectMenuUrls, composeFeatureRoutes, urlResolves } from '@okr/tenant-util';
import { FEATURE_ROUTES } from './feature-catalogue';
import { UNGATED_ROUTES } from './ungated-routes';
import { markedFeatureBlock } from './compose-gated-routes';
import type { Route } from '@angular/router';
import { AOC_AREA_IDS, AOC_AREA_ROUTES } from '@okr/aoc-util';

describe('catalogue route coverage', () => {
  it('every declared menu url resolves against the composed route table', () => {
    // UNGATED_ROUTES: catalogued menu rows may point at a control-plane screen that is
    // deliberately outside FEATURE_ROUTES (the feature picker). It still has to resolve.
    const routes = [...composeFeatureRoutes(FEATURE_ROUTES), ...UNGATED_ROUTES];
    const unresolved = collectMenuUrls(FEATURE_BLOCKS).filter(u => !urlResolves(routes, u));
    expect(unresolved).toEqual([]);
  });
});

/**
 * Every catalogued `navigate` url resolves to exactly ONE owning block (finance split review, 2026-11-10).
 * The owner of a match is the block whose fragment matched, or — inside a fragment — the deepest child marked
 * `data.featureBlock` on the matched path (the per-child gate `composeGatedFeatureRoutes` applies). Two blocks
 * both able to serve one url would make the feature gate depend on route ORDER, which is how a duplicated
 * shell or a moved screen silently keeps the old gate.
 */
describe('one owning block per menu url', () => {
  const seg = (u: string): string[] => u.split('?')[0].split('/').filter(Boolean);

  /** The owners this block's routes yield for `segments` (all matching paths, not just the first). */
  function owners(routes: Route[], segments: string[], owner: string): string[] {
    const found: string[] = [];
    for (const route of routes) {
      const rs = seg(route.path ?? '');
      if (rs.length > segments.length) continue;
      if (!rs.every((r, i) => r.startsWith(':') || r === segments[i])) continue;
      const here = markedFeatureBlock(route) ?? owner;
      const rest = segments.slice(rs.length);
      if (rest.length === 0) { found.push(here); continue; }
      found.push(...owners(route.children ?? [], rest, here));
    }
    return found;
  }

  /**
   * Urls that legitimately match in two blocks because Angular takes the FIRST match in table order and a
   * later block has a broad `:param` catch-all. Each entry: url -> the block Angular actually picks.
   */
  const FIRST_MATCH_WINS: Record<string, string> = {
    // cms's `private/:id` content-page catch-all also matches these; the blocks are listed ahead of cms.
    '/private/file-transfer': 'file-transfer',
    '/private/file-transfer-monitor': 'file-transfer',
    '/private/learning-rooms': 'learning',
    '/private/news-center/video': 'news-center',
    // subject's `person/:personKey` also matches; `profile` owns its own child of the shared `person` path.
    '/person/profile': 'profile',
  };

  it('every catalogued navigate url resolves to exactly one owning block', () => {
    const defects: string[] = [];
    [...new Set(collectMenuUrls(FEATURE_BLOCKS))].forEach(url => {
      const all = [...new Set(FEATURE_ROUTES.flatMap(b => owners(b.routes(), seg(url), b.id)))];
      if (all.length === 1) return;
      const first = FEATURE_ROUTES.map(b => owners(b.routes(), seg(url), b.id)[0]).find(Boolean);
      if (all.length > 1 && FIRST_MATCH_WINS[url] === first) return;
      defects.push(`${url}: ${all.join(', ') || 'no block'}`);
    });
    expect(defects).toEqual([]);
  });

  it('the moved finance screens are owned by their new blocks', () => {
    const ownerOf = (url: string) => [...new Set(FEATURE_ROUTES.flatMap(b => owners(b.routes(), seg(url), b.id)))];
    expect(ownerOf('/accounting/@BOOKS@/cost-center/c-cost-center')).toEqual(['cost-accounting']);
    expect(ownerOf('/accounting/@BOOKS@/assets')).toEqual(['asset']);
    expect(ownerOf('/expense/all/c-expense')).toEqual(['expense']);
    expect(ownerOf('/accounting/@BOOKS@/journal/c-journal')).toEqual(['finance']);
  });
});

describe('content integrity route (spec 1.101 phase 2)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the page block has the integrity path ahead of the :listId catch-all', () => {
    const paths = child(blockRoutes('cms'), 'page').map(r => r.path);
    expect(paths).toContain('integrity');
    expect(paths.indexOf('integrity')).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
  });
});

describe('document orphans route (spec 1.101 phase 2)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the document block has the orphans path ahead of the :listId catch-all, behind an admin guard', () => {
    const children = child(blockRoutes('document'), 'document');
    const paths = children.map(r => r.path);
    expect(paths).toContain('orphans');
    expect(paths.indexOf('orphans')).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
    expect(children.find(r => r.path === 'orphans')?.canActivate).toHaveLength(1);
  });
});

describe('trip maintenance, trip kiosk and diary import routes (spec 1.101 phase 2)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it.each([
    ['trip', 'trips', 'maintenance'],
    ['diary', 'diary', 'import'],
    ['trip', 'trips', 'kiosk'],
  ])('the %s block has %s/%s ahead of the :listId catch-all, behind one guard', (block, root, path) => {
    const children = child(blockRoutes(block), root);
    const paths = children.map(r => r.path);
    expect(paths).toContain(path);
    expect(paths.indexOf(path)).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
    expect(children.find(r => r.path === path)?.canActivate).toHaveLength(1);
  });
});

describe('membership SRV route (spec 1.101 phase 3)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the membership block has srv ahead of the :listId catch-all, behind one guard', () => {
    const children = child(blockRoutes('relationship'), 'membership');
    const paths = children.map(r => r.path);
    expect(paths).toContain('srv');
    expect(paths.indexOf('srv')).toBeLessThan(paths.indexOf(':listId/:orgId/:contextMenuName'));
    expect(children.find(r => r.path === 'srv')?.canActivate).toHaveLength(1);
  });
});

describe('person Bexio contacts route (spec 1.101 phase 3)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('bexio-contacts is declared before :personKey (else the param route swallows it), behind one guard', () => {
    const children = child(blockRoutes('subject'), 'person');
    const paths = children.map(r => r.path);
    expect(paths).toContain('bexio-contacts');
    expect(paths.indexOf('bexio-contacts')).toBeLessThan(paths.indexOf(':personKey'));
    expect(paths.indexOf('bexio-contacts')).toBeLessThan(paths.indexOf(':listId/:contextMenuName'));
    expect(children.find(r => r.path === 'bexio-contacts')?.canActivate).toHaveLength(1);
  });
});

describe('chat maintenance route (spec 1.101 phase 4)', () => {
  const blockRoutes = (id: string) => FEATURE_ROUTES.find(b => b.id === id)!.routes();
  const child = (routes: ReturnType<typeof blockRoutes>, path: string) => routes.find(r => r.path === path)?.children ?? [];

  it('the chat block routes only /chat/maintenance, lazily, behind one admin guard', () => {
    const routes = blockRoutes('chat');
    expect(routes.map(r => r.path)).toEqual(['chat']);
    const children = child(routes, 'chat');
    expect(children.map(r => r.path)).toEqual(['maintenance']);
    expect(children[0].canActivate).toHaveLength(1);
    expect(children[0].loadComponent).toBeTypeOf('function');
    expect(children[0].component).toBeUndefined();
  });
});

/**
 * Spec 1.101 phase 5: the hub's four area routes live here, the card targets and segment bar in
 * `@okr/aoc-util` (`AOC_AREA_ROUTES`). Nothing else ties the two copies together, so a renamed
 * path on either side would leave a segment or a menu row pointing at nothing.
 */
describe('AOC hub area routes match AOC_AREA_ROUTES (spec 1.101 phase 5)', () => {
  const aoc = FEATURE_ROUTES.find(b => b.id === 'aoc')!.routes().find(r => r.path === 'aoc')?.children ?? [];
  const areaRoutes = aoc.filter(r => typeof r.data?.['area'] === 'string');

  it('declares exactly one route per area, at the path AOC_AREA_ROUTES names', () => {
    const declared = Object.fromEntries(areaRoutes.map(r => [r.data?.['area'] as string, `/aoc/${r.path}`]));
    expect(declared).toEqual(AOC_AREA_ROUTES);
    expect(areaRoutes).toHaveLength(AOC_AREA_IDS.length);
  });
});

describe('news-center routes (design 2026-11-08)', () => {
  const children = () => FEATURE_ROUTES.find(b => b.id === 'news-center')!.routes().find(r => r.path === 'private')?.children ?? [];

  it('a bare /private/news-center opens the video tab instead of falling through to cms', () => {
    const bare = children().find(r => r.path === 'news-center');
    expect(bare).toMatchObject({ redirectTo: 'news-center/video', pathMatch: 'full' });
  });

  it('the block is listed ahead of cms, so neither path reaches cms\'s private/:id catch-all', () => {
    const ids = FEATURE_ROUTES.map(b => b.id);
    expect(ids.indexOf('news-center')).toBeLessThan(ids.indexOf('cms'));
  });
});
