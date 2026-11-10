import { Router } from '@angular/router';

import { isSectionCtaUrl } from '@okr/cms-section-util';

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
