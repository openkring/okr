import type { Route } from '@angular/router';
import type { FeatureBlock, MenuSpec } from './feature-catalogue.types';

/**
 * Anything that owns a lazy Angular route fragment for one block. Deliberately NOT
 * `FeatureBlock` — that type is the Angular-free metadata half (see its doc comment);
 * the route half lives in `@okr/tenant-routes`'s `BlockRoutes`, which structurally
 * satisfies this. `composeFeatureRoutes` itself stays here (not in `tenant-routes`)
 * because it is a pure route-matching helper the route-coverage test needs regardless of
 * which side owns the data — only `import type { Route }` is Angular-touching, and type
 * imports are erased at compile time, so this never ships Angular code anywhere.
 */
export interface RouteSource {
  routes: () => unknown[];
}

/** Build a flat route table from block route fragments. Every fragment stays lazy. */
export function composeFeatureRoutes(sources: RouteSource[]): Route[] {
  return sources.flatMap(source => source.routes() as Route[]);
}

/**
 * Which block owns a given `menuItems` doc id? Menu docs are globally shared, so this is
 * how a rendered tree learns whether its owning feature is on for this tenant. Returns
 * `undefined` for tenant-authored menu entries (not declared by any block's `menu`), which
 * are never filtered.
 */
export function blockOfMenuKey(catalogue: FeatureBlock[], key: string): string | undefined {
  const hit = (specs: MenuSpec[]): boolean =>
    specs.some(s => s.key === key || hit(s.children ?? []));
  for (const block of catalogue) {
    if (hit(block.menu)) return block.id;
  }
  return undefined;
}

/**
 * Every non-empty `url` declared anywhere in the catalogue's menu specs, from `navigate`
 * entries ONLY. `MenuSpec.action` is `'navigate' | 'sub' | 'context' | 'call' | 'toggle'`
 * (`feature-catalogue.types.ts`) — only `navigate` carries a router path. `sub`/`context`
 * wrapper docs carry no `url` at all, but `call`/`toggle` docs DO carry a non-empty `url`
 * that is NOT a route: it's an action verb (`'add'`, `'exportRaw'`, `'toggleEditMode'`, ...)
 * the owning list/page component's own handler dispatches on, read straight off the live
 * `menuItems` Firestore doc. Those values are correct data — copy them verbatim — and must
 * be excluded here, not blanked in the catalogue: `menu-seed.util.ts`'s
 * `STRUCTURAL_FIELDS` includes `url` and rewrites it on every seed, so an empty `url` on a
 * `call` entry would ship as a real seed value and silently break that menu item's action
 * dispatch on the next seed against a live tenant. See `feature-routes.util.spec.ts` for
 * the pinning test.
 */
export function collectMenuUrls(catalogue: FeatureBlock[]): string[] {
  const urls: string[] = [];
  const visit = (spec: MenuSpec): void => {
    if (spec.action === 'navigate' && spec.url) urls.push(spec.url);
    (spec.children ?? []).forEach(visit);
  };
  catalogue.forEach(b => b.menu.forEach(visit));
  return urls;
}

const segmentsOf = (url: string): string[] => url.split('/').filter(Boolean);

/**
 * Does `url` resolve against `routes`? A `:param` segment matches any single segment.
 * Deliberately simple — it exists to catch a menu entry pointing at a route the bundle
 * does not ship, which is the p13 failure mode, not to reimplement the Angular matcher.
 */
export function urlResolves(routes: Route[], url: string): boolean {
  // Empty for 'sub'/'context' wrapper entries (no url at all). A non-empty url here is
  // guaranteed to be a real router path IF the caller sourced it from `collectMenuUrls` —
  // that's where the `action === 'navigate'` filter lives, deliberately upstream of this
  // function, because `urlResolves` is also called directly (e.g. from tests) against an
  // arbitrary url and has no `MenuSpec`/`action` in scope to filter on here. `call`/
  // `toggle` entries carry a non-route action-verb payload in `url` and must never reach
  // this function through `collectMenuUrls`.
  if (!url) return true;

  const match = (candidates: Route[], segments: string[]): boolean => {
    if (segments.length === 0) return true;

    for (const route of candidates) {
      const routeSegments = segmentsOf(route.path ?? '');
      if (routeSegments.length > segments.length) continue;

      const head = segments.slice(0, routeSegments.length);
      const fits = routeSegments.every((rs, i) => rs.startsWith(':') || rs === head[i]);
      if (!fits) continue;

      const rest = segments.slice(routeSegments.length);
      if (rest.length === 0) return true;
      if (match(route.children ?? [], rest)) return true;
    }
    return false;
  };

  return match(routes, segmentsOf(url));
}
