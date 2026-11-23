import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { combineLatest, race, timer } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import { AppStore, READINESS_TIMEOUT_MS } from '@okr/shared-feature';
import { resolveUserStartUrl, safeRootUrl } from '@okr/shared-util-core';

/**
 * Sends the bare app URL ('/') to the tenant's configured `app-config.rootUrl`.
 *
 * Every path that does not name a route — opening the domain, launching the installed PWA
 * (`start_url: "/"`), AppNavigationService.back() with an empty history — ends up on '/'.
 * Before this guard each app hard-coded its own `redirectTo` target there, which drifted from
 * `rootUrl` (scs sent signed-in users to /public/welcome although its rootUrl is the dashboard).
 * Now `rootUrl` is the tenant's answer to "where does the user land without choosing" — unless
 * the signed-in user picked their own start page in the profile (`UserModel.startPage`), which
 * wins. A start page whose feature the tenant switched off later lands on `rootUrl` through that
 * route's own feature guard. While the user is crew of an open Logbuch trip and opted in
 * («Notfall-Seite bei Ausfahrt anzeigen», spec 1.158), the Notfall page wins over both.
 * A missing or unusable target, or one that leads back here, opens the welcome page (`safeRootUrl`).
 *
 * WHY A GUARD AND NOT `redirectTo: () => …`: the first navigation runs at bootstrap, before
 * `app-config` has loaded, and `appConfig()` then returns the AppConfig class default. The guard
 * holds activation until the config AND the user session have settled (the start page lives on
 * the user doc, which loads after sign-in), with the same timer escape hatch as
 * `isFeatureEnabledGuard` so a stalled read can never strand the app on a blank '/'.
 *
 * Use on a componentless route: `{ path: '', pathMatch: 'full', canActivate: [rootUrlGuard], children: [] }`.
 */
export const rootUrlGuard: CanActivateFn = (_route, state) => {
  const appStore = inject(AppStore);
  const router = inject(Router);

  return race(
    combineLatest([toObservable(appStore.isAppConfigSettled), toObservable(appStore.isUserSessionReady)]).pipe(
      filter(([config, session]) => config && session),
      take(1),
    ),
    timer(READINESS_TIMEOUT_MS),
  ).pipe(
    take(1),
    map(() => router.parseUrl(safeRootUrl(resolveUserStartUrl(appStore.currentUser(), appStore.appConfig().rootUrl), state.url))),
  );
};
