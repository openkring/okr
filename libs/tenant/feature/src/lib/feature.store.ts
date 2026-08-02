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
