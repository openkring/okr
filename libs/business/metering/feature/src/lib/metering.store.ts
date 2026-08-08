import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CommissionEntryModel, MeteringRecordModel } from '@okr/shared-models';
import { debugListLoaded } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';

import { MeteringService } from '@okr/business-metering-data-access';
import { METERING_I18N_KEYS, periodOf, recentPeriods } from '@okr/business-metering-util';
import { PartnerService } from '@okr/business-partner-data-access';

/** Which half of the ledger the screen shows — the pushed measurement, or what was billed from it. */
export type MeteringView = 'records' | 'entries';

export type MeteringState = {
  period: string;
  view: MeteringView;
  isRunning: boolean;
};

export const MeteringStore = signalStore(
  withState<MeteringState>({ period: periodOf(), view: 'records', isRunning: false }),
  withProps(() => ({
    appStore: inject(AppStore),
    alertService: inject(AlertService),
    meteringService: inject(MeteringService),
    partnerService: inject(PartnerService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(METERING_I18N_KEYS),
  })),
  withProps((store) => ({
    recordsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.meteringService.listRecords().pipe(
        debugListLoaded<MeteringRecordModel>('MeteringStore.records', params.currentUser),
      ),
    }),
    entriesResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.meteringService.listEntries().pipe(
        debugListLoaded<CommissionEntryModel>('MeteringStore.entries', params.currentUser),
      ),
    }),
    partnersResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: () => store.partnerService.list(),
    }),
  })),

  withComputed((state) => ({
    isLoading: computed(() => state.recordsResource.isLoading() || state.entriesResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    periods: computed(() => recentPeriods()),
    partnerNames: computed(() => new Map(
      (state.partnersResource.value() ?? []).map(p => [p.okey, p.name]))),
  })),

  withComputed((state) => ({
    records: computed(() =>
      (state.recordsResource.value() ?? []).filter(r => r.period === state.period())),
    entries: computed(() =>
      (state.entriesResource.value() ?? []).filter(e => e.period === state.period())),
  })),

  withComputed((state) => ({
    // The partner's monthly invoice line is the SUM of the per-tenant entries, never a figure
    // computed from a partner-level total — the band table is concave and stepped (C3 §2).
    totalCommission: computed(() => state.entries().reduce((sum, e) => sum + e.commission, 0)),
  })),

  withMethods((store) => ({
    setPeriod(period: string) { patchState(store, { period }); },
    setView(view: MeteringView) { patchState(store, { view }); },

    partnerName(partnerKey: string): string {
      return store.partnerNames().get(partnerKey) ?? partnerKey;
    },

    /**
     * C3 §7 — admin-triggered, never scheduled: a run is cheap to repeat and expensive to have
     * fire while a late push is still arriving. Re-running a period overwrites its own entries.
     */
    async run(): Promise<void> {
      if (store.isRunning()) return;
      const ok = await store.alertService.confirm(store.i18n.run_confirm(), true);
      if (ok !== true) return;
      patchState(store, { isRunning: true });
      try {
        const result = await store.meteringService.runCommission(store.period());
        await store.alertService.showToast(
          `${store.i18n.run_conf()} (${result.entries} · CHF ${result.total.toFixed(2)})`);
        store.entriesResource.reload();
        patchState(store, { view: 'entries' });
      } catch (error) {
        store.alertService.error(`${store.i18n.run_error()} ${error}`);
      } finally {
        patchState(store, { isRunning: false });
      }
    },
  })),
);
