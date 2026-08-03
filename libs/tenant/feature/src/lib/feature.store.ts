import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withProps } from '@ngrx/signals';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppStore } from '@okr/shared-feature';
import { FeatureRolloutModel } from '@okr/shared-models';
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
    _rollouts: toSignal(inject(FeatureRolloutService).list(), { initialValue: [] as FeatureRolloutModel[] }),
  })),
  withComputed(store => ({
    effective: computed(() => effectiveFeatures({
      catalogue: FEATURE_BLOCKS,
      rollouts: store._rollouts(),
      // ⚠️ Deliberately NOT coalesced to []: an undefined field on a legacy app-config
      // doc must mean "every non-internal block", not "nothing" (D-BB-10).
      enabled: store._appStore.appConfig()?.enabledFeatures,
      tenantId: store._appStore.tenantId(),
    })),
  })),
  withComputed(store => ({
    isEnabled: computed(() => (blockId: string): boolean => store.effective().has(blockId)),
  })),
);
