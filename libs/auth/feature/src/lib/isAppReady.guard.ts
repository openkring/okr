import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, CanActivateChildFn } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';

import { AppStore } from '@bk2/shared-feature';

/**
 * Holds route activation until the app is ready (auth settled + UserModel and categories
 * loaded for authenticated users; immediate for logged-out users on public routes).
 *
 * This replaces the previous mechanism that gated the <ion-router-outlet> behind an @if:
 * removing the outlet from the DOM while an Ionic navigation transition was in flight
 * destroyed the StackController and crashed with "can't access property 'commit', d is
 * undefined" (StackController.transition reading the cleared containerEl). By delaying
 * navigation instead of destroying the outlet, feature components still never activate
 * before their data is ready, but the outlet stays mounted and Ionic never crashes.
 */
export const isAppReadyGuard: CanActivateChildFn = () => {
  const appStore = inject(AppStore);

  // appStore.isAppReady() is true immediately for logged-out users, so public routes
  // (welcome, login) resolve without waiting. Authenticated users wait for the first
  // emission where everything has loaded.
  return toObservable(appStore.isAppReady).pipe(
    filter((ready) => ready === true),
    take(1),
    map(() => true),
  );
};

/** CanActivate variant for top-level (childless) routes that need the same gate. */
export const isAppReadyCanActivate: CanActivateFn = (route, state) =>
  isAppReadyGuard(route, state);
