import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { resolveAccountingArea, ResolvedAccountingArea } from '@okr/finance-accounting-util';

/**
 * The accounting area and segment of the current url, re-read on every NavigationEnd (spec 1.100):
 * Ionic keeps the previous page alive, so a value captured once would be stale when that page is
 * shown again. Undefined outside the treasurer's accounting screens. Call in an injection context.
 */
export function injectAccountingRoute(): Signal<ResolvedAccountingArea | undefined> {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => resolveAccountingArea(e.urlAfterRedirects)),
    ),
    { initialValue: resolveAccountingArea(router.url) },
  );
}
