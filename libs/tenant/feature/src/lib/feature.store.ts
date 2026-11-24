import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withProps } from '@ngrx/signals';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, type Observable } from 'rxjs';
import { AppStore } from '@okr/shared-feature';
import type { FeatureRolloutModel } from '@okr/shared-models';
import { FeatureRolloutService } from '@okr/tenant-data-access';
import { FEATURE_BLOCKS, effectiveFeatures, hiddenKeySet } from '@okr/tenant-util';

interface RolloutRead { uid: string; rollouts: FeatureRolloutModel[]; }

/**
 * The runtime answer to "is this block on for this tenant?" — catalogue ∩ rollout ∩
 * enablement (D-BB-3). Consumed by MenuStore (what renders) and isFeatureEnabledGuard
 * (what is reachable).
 *
 * `@okr/tenant-feature` (this lib) deliberately holds ONLY this store and its guard — no
 * route table. The Angular ROUTE fragment (`BlockRoutes`/`FEATURE_ROUTES`,
 * `feature-catalogue.ts`) used to live here and was moved to `@okr/tenant-routes`: it eagerly
 * imports `aoc-feature`/`calendar-calevent-feature` to compose their route fragments, and those libs
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
    _rolloutService: inject(FeatureRolloutService),
  })),
  withComputed(store => ({
    _uid: computed(() => store._appStore.fbUser()?.uid),
  })),
  withProps(store => ({
    /**
     * The rollout list, and WHOSE read it is. Read per signed-in user, never for a visitor: the collection is
     * `signedIn()`-only, and a listen attached before the sign-in is denied, settles on `[]`, ends, and is not
     * re-attached — so a `beta` block stayed off until a reload (1.174).
     *
     * The uid travels with the list so that `_rollouts` below knows a list of somebody else (or of nobody) for what it
     * is in the very moment the user changes. Re-reading alone would not do: the stream switches in an effect, and a
     * guard that runs before it would still decide on the old list.
     */
    _rolloutRead: toSignal(
      toObservable(store._uid).pipe(
        switchMap((uid): Observable<RolloutRead | undefined> => uid === undefined ? of(undefined) : store._rolloutService.list().pipe(
          // `FirestoreService` settles a failed listen on `[]` itself; an error that comes through all the same must
          // neither re-throw in every read of this store nor end the reading for the next user.
          catchError(err => {
            console.error('FeatureStore: cannot read the rollouts', err);
            return of<FeatureRolloutModel[]>([]);
          }),
          map(rollouts => ({ uid, rollouts })),
        )),
      ),
      { initialValue: undefined },
    ),
  })),
  withComputed(store => ({
    // `undefined` = not read yet, NOT `[]`: `[]` is a legitimate loaded value ("no rollout doc exists, use every
    // block's catalogue default"). `settled` below needs exactly that distinction.
    _rollouts: computed(() => {
      const read = store._rolloutRead();
      return read !== undefined && read.uid === store._uid() ? read.rollouts : undefined;
    }),
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
     * `firestore.rules` allows reading `feature-rollout` only `if signedIn()`, so a signed-out
     * visitor's rollouts are not read at all. Waiting on that source would hang every PUBLIC
     * route (this guard is prepended to every block's fragments, including `core: true` ones).
     * It is a decision: rollout documents have no effect on public routes. Changing that would mean relaxing
     * `firestore.rules`' `feature-rollout` read to allow anonymous reads, which would make the
     * operator-authored `reason` prose world-readable — an owner decision, not this store's.
     * App-config is not waited for here either, although `AppStore.appConfigResource` loads it
     * for anonymous visitors too (it is world-readable): a caller that needs it also checks
     * `AppStore.isAppConfigSettled`, as the dashboard page does.
     *
     * `fbUser()` is tri-state: `undefined` while auth is still restoring (NOT settled — a
     * returning user's session is about to resolve), `null` signed out, a `User` signed in.
     * Signing in inside the app therefore UNsettles the store until that user's rollouts are read
     * (and app-config has settled); signing out settles it at once, on the catalogue defaults.
     *
     * The `readinessTimedOut` clause is the same watchdog `isAppReady` uses, and it covers
     * exactly one case: the whole session is stalled (the user doc never loaded either), the
     * watchdog fired, and navigation was opened without data — this gate gives up with it
     * rather than being the one thing still blocking.
     *
     * ⚠️ IT IS NOT A GENERAL STALL GUARANTEE, and must not be read as one. `app.store.ts` arms
     * that timer only while `authed && !isDataReady()` and RESETS the flag once `isDataReady()`
     * is true; `isDataReady` reads `currentUserResource` and `categoriesResource` and never
     * `appConfigResource` or the rollout listen. A signed-in user whose user doc and categories
     * resolve normally while app-config or the rollout listen stalls WITHOUT resolving or
     * erroring therefore never sees this clause fire, and `settled` stays false forever. What
     * saves navigation in that case is `isFeatureEnabledGuard`'s OWN `timer(READINESS_TIMEOUT_MS)`
     * — the guarantee lives there, not here.
     *
     * ERROR paths, by contrast, settle on their own: `FirestoreService.searchData` catches
     * stream errors and falls back to `[]`, and an errored `appConfigResource` reports
     * `status() === 'error'`, which counts as settled. Only a listener that never answers at
     * all needs the guard's timer.
     */
    settled: computed(() => {
      if (store._appStore.fbUser() === null) return true;
      if (store._appStore.readinessTimedOut()) return true;
      return store._rollouts() !== undefined && store._appStore.isAppConfigSettled();
    }),
  })),
  withComputed(store => ({
    isEnabled: computed(() => (blockId: string): boolean => store.effective().has(blockId)),
    /**
     * The tenant's per-row opt-out set — catalogue menu keys suppressed even though the
     * owning block is enabled (`app-config.hiddenMenuKeys`, the fourth visibility gate).
     *
     * Coalescing an absent field to an empty set is correct here and is NOT the D-BB-10 trap
     * above: `undefined` and `[]` both mean "nothing hidden", so there is no third state to
     * preserve. Pre-settle it is empty, i.e. this gate fails OPEN — a hidden row may flash
     * for one change-detection pass on a cold start, which is the same direction
     * `effective()` already fails for a switched-off `ga` block and is strictly safer than
     * hiding a row the tenant never opted out of.
     */
    hiddenMenuKeys: computed(() => hiddenKeySet(store._appStore.appConfig()?.hiddenMenuKeys)),
  })),
);
