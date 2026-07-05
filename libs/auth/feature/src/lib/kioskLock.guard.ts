import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateChildFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { isKioskOnly } from '@okr/shared-util-core';

/** The URL a kiosk-only user is locked to (trips route is trips/:listId/:contextMenuName). */
const KIOSK_URL = '/trips/logbuch/c-trips';

/**
 * Locks a kiosk-only user (see isKioskOnly) to the trips area. Any attempt to activate a
 * route outside /trips is silently redirected to KIOSK_URL (typed URLs, deep links, the
 * back button, the post-login rootUrl redirect, and public pages all bounce back).
 *
 * Waits on appStore.isAppReady — the same readiness signal isAppReadyGuard uses — before
 * deciding, so currentUser (and its roles) is guaranteed loaded and there is no race with
 * async auth/user loading. Non-kiosk users always pass through unchanged.
 */
export const kioskLockGuard: CanActivateChildFn = (_childRoute, state) => {
  const appStore = inject(AppStore);
  const router = inject(Router);
  return toObservable(appStore.isAppReady).pipe(
    filter(ready => ready === true),
    take(1),
    map(() => {
      if (!isKioskOnly(appStore.currentUser())) return true;
      const path = state.url.split('?')[0].split('#')[0];
      if (path.startsWith('/trips')) return true;
      return router.parseUrl(KIOSK_URL);
    }),
  );
};
