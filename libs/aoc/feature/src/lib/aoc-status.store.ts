import { computed, inject } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import { FeatureStore } from '@okr/tenant-feature';
import { AOC_STATUS_I18N_KEYS, AOC_STATUS_SERVICES, PINGEN_SERVICE_ID, ServiceStatusResult, sortByProblem, statusSummary, visibleStatusServices } from '@okr/aoc-util';

export type AocStatusState = {
  result: ServiceStatusResult | undefined;
  loading: boolean;
  failed: boolean;
  /** Spec 1.143: the manual webhook self-test. */
  testing: boolean;
  testMessage: string;
};

type SelftestStep = 'http' | 'stored' | 'processed';
type SelftestAnswer = { level: 'ok' | 'down'; failedStep?: SelftestStep };

const initialState: AocStatusState = { result: undefined, loading: false, failed: false, testing: false, testMessage: '' };

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
    // the server leaves the Pingen row out for everyone but the platform operator: no row, not a grey one
    const visible = computed(() => visibleStatusServices(AOC_STATUS_SERVICES, store.isEnabled())
      .filter(s => s.id !== PINGEN_SERVICE_ID || !store.result() || !!store.result()?.services[PINGEN_SERVICE_ID]));
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

    /** Runs the receiver self-test now, then reloads so the row shows the fresh result. */
    async runSelftest(): Promise<void> {
      const i18n = store.i18n;
      patchState(store, { testing: true, testMessage: i18n.test_running() });
      try {
        const fn = httpsCallable<void, SelftestAnswer>(getFunctions(getApp(), 'europe-west6'), 'runWebhookSelftestNow', { timeout: 120_000 });
        const { data } = await fn();
        const step = { http: i18n.step_http, stored: i18n.step_stored, processed: i18n.step_processed }[data.failedStep ?? 'http'];
        patchState(store, { testMessage: data.level === 'ok' ? i18n.test_ok() : fill(i18n.test_failed(), { step: step() }) });
      } catch (e) {
        console.warn('AocStatusStore: the webhook self-test could not run', e);
        patchState(store, { testMessage: fill(i18n.test_failed(), { step: i18n.step_http() }) });
      }
      patchState(store, { testing: false });
      await this.load();
    },
  })),

  withHooks({
    onInit(store) {
      void store.load();
    },
  }),
);
