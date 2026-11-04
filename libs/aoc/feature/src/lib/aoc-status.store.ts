import { computed, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { FeatureStore } from '@okr/tenant-feature';
import { AOC_STATUS_I18N_KEYS, AOC_STATUS_SERVICES, ServiceStatusResult, sortByProblem, statusSummary, visibleStatusServices } from '@okr/aoc-util';

export type AocStatusState = {
  result: ServiceStatusResult | undefined;
  loading: boolean;
  failed: boolean;
};

const initialState: AocStatusState = { result: undefined, loading: false, failed: false };

/**
 * Spec 1.137: the live status comes from `getServiceStatus`, cached server-side for five minutes.
 * The answer is the same for every tenant; which services and parts show is decided here, from the
 * tenant's feature blocks. A failed call leaves the rows on screen with their links.
 */
export const AocStatusStore = signalStore(
  withState(initialState),
  withProps(() => ({
    featureStore: inject(FeatureStore),
    i18n: inject(I18nService).translateAll(AOC_STATUS_I18N_KEYS),
  })),

  withComputed(store => ({
    isEnabled: computed(() => store.featureStore.isEnabled()),
  })),

  withComputed(store => {
    const visible = computed(() => visibleStatusServices(AOC_STATUS_SERVICES, store.isEnabled()));
    return {
      services: computed(() => sortByProblem(visible(), store.result(), store.isEnabled())),
      summary: computed(() => statusSummary(visible(), store.result(), store.isEnabled())),
    };
  }),

  withMethods(store => ({
    async load(): Promise<void> {
      patchState(store, { loading: true, failed: false });
      try {
        const fn = httpsCallable<void, ServiceStatusResult>(getFunctions(getApp(), 'europe-west6'), 'getServiceStatus');
        const { data } = await fn();
        patchState(store, { result: data, loading: false });
      } catch (e) {
        console.warn('AocStatusStore: could not load the service status', e);
        patchState(store, { loading: false, failed: true });
      }
    },
  })),

  withHooks({
    onInit(store) {
      void store.load();
    },
  }),
);
