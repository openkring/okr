import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { race, timer } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { AppStore, READINESS_TIMEOUT_MS } from '@okr/shared-feature';

/** Used when the configured rootUrl is missing or points back at '/' (which would loop). */
const FALLBACK_ROOT_URL = '/public/welcome';

/**
 * Sends the bare app URL ('/') to the tenant's configured `app-config.rootUrl`.
 *
 * Every path that does not name a route — opening the domain, launching the installed PWA
 * (`start_url: "/"`), AppNavigationService.back() with an empty history — ends up on '/'.
 * Before this guard each app hard-coded its own `redirectTo` target there, which drifted from
 * `rootUrl` (scs sent signed-in users to /public/welcome although its rootUrl is the dashboard).
 * Now `rootUrl` is the single answer to "where does the user land without choosing".
 *
 * WHY A GUARD AND NOT `redirectTo: () => …`: the first navigation runs at bootstrap, before
 * `app-config` has loaded, and `appConfig()` then returns the AppConfig class default. The guard
 * holds activation until the config has settled, with the same timer escape hatch as
 * `isFeatureEnabledGuard` so a stalled read can never strand the app on a blank '/'.
 *
 * Use on a componentless route: `{ path: '', pathMatch: 'full', canActivate: [rootUrlGuard], children: [] }`.
 */
export const rootUrlGuard: CanActivateFn = () => {
  const appStore = inject(AppStore);
  const router = inject(Router);

  return race(
    toObservable(appStore.isAppConfigSettled).pipe(filter(Boolean), take(1)),
    timer(READINESS_TIMEOUT_MS),
  ).pipe(
    take(1),
    map(() => {
      const rootUrl = appStore.appConfig().rootUrl?.trim() ?? '';
      const isRoot = rootUrl.replace(/^\/+|\/+$/g, '') === '';
      return router.parseUrl(isRoot ? FALLBACK_ROOT_URL : rootUrl);
    }),
  );
};
