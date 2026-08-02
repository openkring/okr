import type { Route } from '@angular/router';
import type { FeatureBlock, MenuSpec } from './feature-catalogue.types';

/** Build the app's feature route table from the catalogue. Every fragment stays lazy. */
export function composeFeatureRoutes(catalogue: FeatureBlock[]): Route[] {
  return catalogue.flatMap(block => block.routes() as Route[]);
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
