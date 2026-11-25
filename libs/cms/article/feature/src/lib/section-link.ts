import { Router } from '@angular/router';

import { isSectionCtaUrl } from '@okr/cms-section-util';
import { navigateByUrl } from '@okr/shared-util-angular';

/**
 * Follows a section link (tile card / call to action).
 * - `/path` → app route; `https://` → new tab; `mailto:`/`tel:` → same window;
 * - a website url («bootshaus.html», «#anchor») → relative to the website at `/web/`, in a new tab.
 * Urls that fail `isSectionCtaUrl` are never followed.
 */
export function openSectionLink(router: Router, url: string | undefined): void {
  const u = url?.trim();
  if (!u || !isSectionCtaUrl(u)) return;
  if (u.startsWith('/')) {
    void router.navigateByUrl(u);
  } else if (u.startsWith('https://')) {
    window.open(u, '_blank', 'noopener,noreferrer');
  } else if (u.startsWith('mailto:') || u.startsWith('tel:')) {
    window.location.href = u;
  } else {
    window.open('/web/' + u, '_blank', 'noopener,noreferrer');
  }
}

/**
 * True when a «more» url is an app route: `/…`, or a legacy bare route such as «news» that is no
 * website link (no `.html`, anchor, https, mailto or tel) — the router has always resolved those
 * from the root.
 */
export function isAppMoreUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith('/') || !isSectionCtaUrl(u);
}

/**
 * Follows the «more» url of an events/news section: an app route through `navigateByUrl`, a website
 * link (seeded homepage: «termine.html», «news.html») through `openSectionLink`.
 */
export function openMoreLink(router: Router, url: string | undefined): void {
  const u = url?.trim();
  if (!u) return;
  if (isAppMoreUrl(u)) void navigateByUrl(router, u);
  else openSectionLink(router, u);
}
