import type { Route } from '@angular/router';
import { isFeatureEnabledGuard } from '@okr/tenant-feature';
import { FEATURE_ROUTES, type BlockRoutes } from './feature-catalogue';

/**
 * The app route table, composed from the catalogue AND gated per block.
 *
 * This is what an app's `app.routes.ts` must call. It is deliberately NOT
 * `composeFeatureRoutes` (`@okr/tenant-util`), which is a bare `flatMap` with no gate:
 * that function exists for the route-COVERAGE test (does every catalogued menu url resolve
 * against some route?), a question that has nothing to do with any one tenant. Shipping its
 * output as an app's route table would make every catalogued screen reachable in every
 * tenant, which is the precise opposite of what the catalogue is for. Concretely: the repo
 * owner ruled `games` to `defaultAvailability: 'disabled'` on 2026-08-04 intending `/quiz`
 * to disappear, while the block deliberately keeps its route fragment (disabling is not
 * deleting) — with an ungated `flatMap`, `/quiz` stays live behind nothing but
 * `isAuthenticatedGuard` and the ruling has zero effect.
 *
 * WHY A GUARD AND NOT A STATIC FILTER. The obvious alternative — filter `FEATURE_ROUTES`
 * down to the tenant's effective blocks before handing the array to `provideRouter` — is not
 * available. `FeatureStore.effective()` is a computed over `AppStore.appConfig()`'s
 * `enabledFeatures` (an async Firestore read) intersected with the async
 * `FeatureRolloutService.list()` stream. The route table is assembled at module-evaluation
 * time, long before either has resolved, so there is nothing to filter ON. The decision has
 * to be deferred to navigation time, and a `CanActivateFn` is exactly that.
 *
 * TWO PROPERTIES THAT LOOK OPTIONAL AND ARE NOT:
 *
 * 1. THE GUARD GOES ON THE TOP-LEVEL FRAGMENT ONLY. Angular evaluates an ancestor's
 *    `canActivate` before activating any descendant, so a child inherits the gate; adding
 *    the same guard to `children` would buy nothing and cost one extra `inject`/`Set.has`
 *    per segment. `.map` therefore walks only the array `routes()` returns and never
 *    recurses into `children`.
 *
 * 2. `core: true` BLOCKS ARE GATED TOO — no `block.core` check here, and none wanted.
 *    `effectiveFeatures` (`feature-rollout.util.ts`) lets a core block bypass ENABLEMENT
 *    but not ROLLOUT: a core block with a `feature-rollout/<id>` doc set to `disabled` (or
 *    listing the tenant in `denyTenants`) drops out of `effective()`. That is the "kill a
 *    broken core block without a redeploy" lever, and skipping the guard for core blocks
 *    would silently remove it. Note this file cannot see `core` anyway — it is metadata on
 *    `FEATURE_BLOCKS` in `@okr/tenant-util`, not on `BlockRoutes` — which is a happy
 *    accident, not the reason.
 *
 * ROLE GUARDS ARE PRESERVED, IN ORDER, AND PREFIXED — never replaced. `isAuthenticatedGuard`
 * and friends stay exactly where the fragment put them; the feature gate runs first so a
 * tenant that does not have the block is redirected before any role check can leak the
 * shape of a feature it is not entitled to (the guard redirects to the tenant's `rootUrl`
 * rather than 404-vs-403, for the same reason — see `isFeatureEnabledGuard`).
 *
 * THE COLD-START GAP, CLOSED IN TASK G. `isFeatureEnabledGuard` used to read `effective()`
 * synchronously, with no notion of "not loaded yet": during the cold-start window the two
 * async inputs read as their defaults — `appConfig().enabledFeatures` `undefined` (meaning
 * "every non-internal block", D-BB-10) and `rollouts` `[]` (meaning "every block's catalogue
 * `defaultAvailability`") — so the gate FAILED OPEN for a `ga` block the tenant had switched
 * off and would have FAILED CLOSED for a `beta`/`internal` block a rollout doc allow-lists.
 * The guard now waits on `FeatureStore.settled` (an Observable, `isAppReadyGuard`'s shape)
 * before deciding. It remains a NAVIGATION gate rather than an authorisation boundary: role
 * guards and Firestore rules are the security boundary, and this gate deliberately treats a
 * signed-out visitor as settled — anonymous navigation is decided on catalogue defaults alone,
 * because `feature-rollout` is not readable without auth.
 */
export function composeGatedFeatureRoutes(sources: BlockRoutes[] = FEATURE_ROUTES): Route[] {
  return sources.flatMap(source => {
    // One closure per block, shared by that block's fragments: the guard is pure, and
    // re-creating it per fragment would only make identity assertions in tests harder.
    const featureGuard = isFeatureEnabledGuard(source.id);
    return source.routes().map(fragment => ({
      ...fragment,
      canActivate: [featureGuard, ...(fragment.canActivate ?? [])],
    }));
  });
}
