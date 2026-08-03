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

/** Every non-empty `url` declared anywhere in the catalogue's menu specs. */
export function collectMenuUrls(catalogue: FeatureBlock[]): string[] {
  const urls: string[] = [];
  const visit = (spec: MenuSpec): void => {
    if (spec.url) urls.push(spec.url);
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
  if (!url) return true;               // 'sub' / 'context' entries carry no url

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
