import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { race, timer } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { AppStore, READINESS_TIMEOUT_MS } from '@okr/shared-feature';
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
 * WHY THE `race` WITH A TIMER — and why `AppStore.readinessTimedOut` is NOT enough on its own.
 * That watchdog arms only while `authed && !isDataReady()` and RESETS to false the moment
 * `isDataReady()` flips true; `isDataReady` reads `currentUserResource` and `categoriesResource`
 * and never touches `appConfigResource` or the rollout listen. So for a signed-in user whose
 * user doc and categories resolve normally while `app-config` (or the rollout listen) stalls
 * without resolving OR erroring, the watchdog never fires and `settled` never flips — and this
 * guard is prepended to EVERY block's fragments, so every navigation in the app would hang
 * forever. The independent `timer` closes that hole regardless of what `isDataReady()` thinks.
 * `READINESS_TIMEOUT_MS` is the watchdog's own constant, reused so the two gates cannot drift
 * to different grace periods.
 *
 * ⚠️ WHAT THE TIMEOUT DECIDES ON. When the timer wins, the verdict is computed from whatever
 * `effective()` holds at that moment — i.e. the cold-start defaults, which fail OPEN. That is
 * the deliberate trade-off, and the same one `isAppReady`'s watchdog makes: this is a PACKAGING
 * gate, not an authorisation boundary (every fragment keeps its own role guard, and Firestore
 * rules remain the data boundary), so after a stalled load it is better to show a screen the
 * tenant may not have enabled than to strand every navigation on a dead gate.
 *
 * ⚠️ COMPLETION IS NOT OPTIONAL. `take(1)` completes the stream on whichever branch wins; the
 * anonymous fast path inside `settled` and this timer are what guarantee one always does.
 *
 * The verdict is read INSIDE the `map`, not captured up front: by the time either branch fires,
 * `effective()` holds whatever is known then rather than the value it had at subscription time.
 */
export function isFeatureEnabledGuard(blockId: string): CanActivateFn {
  return () => {
    const featureStore = inject(FeatureStore);
    const appStore = inject(AppStore);
    const router = inject(Router);

    return race(
      toObservable(featureStore.settled).pipe(filter(Boolean), take(1)),
      timer(READINESS_TIMEOUT_MS),
    ).pipe(
      take(1),
      map(() => featureStore.effective().has(blockId)
        ? true
        : router.parseUrl(appStore.appConfig()?.rootUrl ?? '/public/welcome')),
    );
  };
}
