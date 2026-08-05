import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AppStore } from '@okr/shared-feature';
import { FeatureStore } from './feature.store';

/**
 * Blocks direct URL entry into a feature the tenant does not have.
 *
 * Redirects silently to the tenant's rootUrl — deliberately NOT a 404-vs-403
 * distinction, which would leak which features exist to a tenant that may not have them.
 *
 * WHY THIS WAITS. `FeatureStore.effective()` is derived from two asynchronous sources
 * (`app-config`'s `enabledFeatures` and the `feature-rollout` stream) and answers even before
 * either has landed — with the cold-start defaults, which fail OPEN for a `ga` block the
 * tenant switched off and CLOSED for a `beta`/`internal` block a rollout doc allow-lists.
 * Reading `effective()` synchronously therefore decides the wrong way on any deep link or hard
 * reload that lands during the load window. `FeatureStore.settled` says when the set is real,
 * and this guard holds activation until it is. Same shape as `isAppReadyGuard`
 * (`@okr/auth-feature`), deliberately: an Observable that emits exactly once and completes.
 *
 * ⚠️ COMPLETION IS NOT OPTIONAL. This guard is prepended to EVERY block's top-level fragments
 * — `core: true` blocks and public routes included (see `composeGatedFeatureRoutes`) — so an
 * Observable that never emits does not break one screen, it breaks every navigation in the
 * app. `settled` is `true` immediately for anonymous visitors and has a watchdog fallback for
 * authenticated ones precisely so this cannot happen; `take(1)` completes the stream the
 * instant it does emit.
 *
 * The verdict is read INSIDE the `map`, not captured up front: by the time `settled` flips,
 * `effective()` holds the loaded answer rather than the default it had at subscription time.
 */
export function isFeatureEnabledGuard(blockId: string): CanActivateFn {
  return () => {
    const featureStore = inject(FeatureStore);
    const appStore = inject(AppStore);
    const router = inject(Router);

    return toObservable(featureStore.settled).pipe(
      filter(Boolean),
      take(1),
      map(() => featureStore.effective().has(blockId)
        ? true
        : router.parseUrl(appStore.appConfig()?.rootUrl ?? '/public/welcome')),
    );
  };
}
