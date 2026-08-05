import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withProps } from '@ngrx/signals';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppStore } from '@okr/shared-feature';
import { FeatureRolloutService } from '@okr/tenant-data-access';
import { FEATURE_BLOCKS, effectiveFeatures } from '@okr/tenant-util';

/**
 * The runtime answer to "is this block on for this tenant?" — catalogue ∩ rollout ∩
 * enablement (D-BB-3). Consumed by MenuStore (what renders) and isFeatureEnabledGuard
 * (what is reachable).
 *
 * `@okr/tenant-feature` (this lib) deliberately holds ONLY this store and its guard — no
 * route table. The Angular ROUTE fragment (`BlockRoutes`/`FEATURE_ROUTES`,
 * `feature-catalogue.ts`) used to live here and was moved to `@okr/tenant-routes`: it eagerly
 * imports `aoc-feature`/`calevent-feature` to compose their route fragments, and those libs
 * import `Menu`/`MenuModal` from `cms-menu-feature` for their own admin screens. The moment
 * `cms-menu-feature` needs `FeatureStore` from this lib (to filter the rendered menu tree by
 * effective feature — see `MenuStore`), keeping the route table here would close a cycle:
 * `cms-menu-feature → tenant-feature → {aoc,calevent}-feature → cms-menu-feature`. Splitting
 * the route table out (not the store) breaks the cycle while keeping `tenant-routes →
 * tenant-feature` valid (Task 19 wires `isFeatureEnabledGuard` into the route tables) — the
 * reverse edge, `tenant-feature → tenant-routes`, must never reappear.
 */
export const FeatureStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    _appStore: inject(AppStore),
    // `initialValue: undefined`, NOT `[]`: `[]` is a legitimate loaded value ("no rollout doc
    // exists, use every block's catalogue default") and cannot be told apart from "the stream
    // has not emitted yet". `settled` below needs exactly that distinction, so the
    // not-yet-emitted state gets its own value and `effective` coalesces it away.
    _rollouts: toSignal(inject(FeatureRolloutService).list(), { initialValue: undefined }),
  })),
  withComputed(store => ({
    effective: computed(() => effectiveFeatures({
      catalogue: FEATURE_BLOCKS,
      // Before the first emission this is the same `[]` it always was — the pre-settle
      // verdict is unchanged, `settled` is what stops anyone acting on it.
      rollouts: store._rollouts() ?? [],
      // ⚠️ Deliberately NOT coalesced to []: an undefined field on a legacy app-config
      // doc must mean "every non-internal block", not "nothing" (D-BB-10).
      enabled: store._appStore.appConfig()?.enabledFeatures,
      tenantId: store._appStore.tenantId(),
    })),
    /**
     * Is `effective()` the real answer yet, or still the cold-start default?
     *
     * `effective()` always RETURNS something, and what it returns before its two async inputs
     * land is not a neutral placeholder: an unemitted rollout stream reads as "every block's
     * catalogue `defaultAvailability`" and an unloaded `enabledFeatures` reads as "every
     * non-internal block" (D-BB-10). So the pre-settle verdict FAILS OPEN for a `ga` block the
     * tenant switched off and FAILS CLOSED for a `beta`/`internal` block a rollout doc
     * allow-lists. `isFeatureEnabledGuard` waits for this signal rather than acting on that.
     *
     * ANONYMOUS IS SETTLED BY DEFINITION — the first clause, and load-bearing.
     * `AppStore.appConfigResource` returns `of(undefined)` when there is no `fbUser`, and
     * `firestore.rules` allows reading `feature-rollout` only `if signedIn()`, so a signed-out
     * visitor's rollout read is denied; it reaches this store as `[]` only because
     * `FirestoreService.searchData` swallows stream errors — i.e. after a failed round trip,
     * or never if the device is offline. Waiting on those sources would hang every PUBLIC
     * route (this guard is prepended to every block's fragments, including `core: true` ones).
     * This clause therefore converts today's ACCIDENTAL anonymous fail-open into a DOCUMENTED
     * decision: an anonymous visitor is gated on catalogue defaults alone, and rollout
     * documents have no effect on public routes. Changing that would mean relaxing
     * `firestore.rules`' `feature-rollout` read to allow anonymous reads, which would make the
     * operator-authored `reason` prose world-readable — an owner decision, not this store's.
     *
     * `fbUser()` is tri-state: `undefined` while auth is still restoring (NOT settled — a
     * returning user's session is about to resolve), `null` signed out, a `User` signed in.
     *
     * The `readinessTimedOut` escape hatch is the same watchdog `isAppReady` uses. Every
     * ERROR path already settles on its own (`FirestoreService` catches stream errors and
     * falls back, so both sources emit), but a Firestore listener that neither resolves nor
     * errors — an offline/blocked network — would otherwise hang navigation forever, which is
     * strictly worse than the fail-open this whole signal exists to fix. When the app-level
     * watchdog has already given up and opened navigation, this gate gives up with it and
     * degrades to the old cold-start behaviour.
     */
    settled: computed(() => {
      if (store._appStore.fbUser() === null) return true;
      if (store._appStore.readinessTimedOut()) return true;
      return store._rollouts() !== undefined && store._appStore.isAppConfigSettled();
    }),
  })),
  withComputed(store => ({
    isEnabled: computed(() => (blockId: string): boolean => store.effective().has(blockId)),
  })),
);
