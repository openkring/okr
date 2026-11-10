// libs/finance/collection/feature/src/lib/billing-board.store.ts
import { computed, inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { confirm, notify, showToast } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import {
  BillingOverviewRow, boardFlags, BoardStateFilter, clearFlagRequest, COLLECTION_I18N_KEYS, CollectionI18n, filterBoardRows,
  flagI18nKey, optionI18nKey,
} from '@okr/finance-collection-util';

interface BillingBoardState {
  rows: BillingOverviewRow[];
  loading: boolean;
  /** '' = loaded; 'forbidden' = the server says the caller is no operator; 'error' = anything else */
  loadError: '' | 'forbidden' | 'error';
  /** true while a row action runs: every action button is disabled, so nothing is started twice */
  busy: boolean;
  stateFilter: BoardStateFilter;
  flagFilter: string;
}

/**
 * The operator's billing board (`/billing/board`, plan 2 Task 12): every tenant's subscription from getBillingOverview,
 * filtered by state and flag, with the row actions «Auf Stripe umstellen», «Wieder aktivieren», «Kündigen» and «Hinweis
 * entfernen» per flag. The route admits an admin or a treasurer; the callables decide who is an operator (operator
 * tenant, admin or treasurer).
 */
export const BillingBoardStore = signalStore(
  withState<BillingBoardState>({ rows: [], loading: false, loadError: '', busy: false, stateFilter: 'all', flagFilter: 'all' }),
  withProps(() => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      appStore,
      functions,
      alertController: inject(AlertController),
      toastController: inject(ToastController),
      i18n: inject(I18nService).translateAll(COLLECTION_I18N_KEYS) as CollectionI18n,
    };
  }),
  withComputed((store) => ({
    filteredRows: computed(() => filterBoardRows(store.rows(), store.stateFilter(), store.flagFilter())),
    flags: computed(() => boardFlags(store.rows())),
  })),
  withMethods((store) => {
    const isPermissionDenied = (e: unknown) => (e as { code?: string } | null)?.code === 'functions/permission-denied';

    function optionName(id: string): string {
      const key = optionI18nKey(id);
      return key ? store.i18n[key]() : id;
    }

    async function load(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const res = await httpsCallable<Record<string, never>, BillingOverviewRow[]>(store.functions, 'getBillingOverview')({});
        patchState(store, { rows: Array.isArray(res.data) ? res.data : [], loadError: '' });
      } catch (e) {
        if (isPermissionDenied(e)) {
          patchState(store, { rows: [], loadError: 'forbidden' });
        } else {
          console.error('BillingBoardStore: getBillingOverview failed', e);
          patchState(store, { loadError: 'error' });
        }
      } finally {
        patchState(store, { loading: false });
      }
    }

    /** Asks, runs one callable with the busy flag set, reloads the board; resolves to the result or undefined. */
    async function act<Req, Res>(message: string, okLabel: string, name: string, data: Req): Promise<Res | undefined> {
      if (store.busy()) return undefined;
      const ok = await confirm(store.alertController, message, okLabel, store.i18n.cancel(), true);
      if (!ok) return undefined;
      patchState(store, { busy: true });
      try {
        const res = (await httpsCallable<Req, Res>(store.functions, name)(data)).data;
        await load();
        return res;
      } catch (e) {
        console.error(`BillingBoardStore: ${name} failed`, e);
        await showToast(store.toastController, isPermissionDenied(e) ? store.i18n.board_forbidden() : store.i18n.error_generic());
        return undefined;
      } finally {
        patchState(store, { busy: false });
      }
    }

    /** the label of an operator flag; an unknown flag shows its id */
    function flagLabel(flag: string): string {
      const key = flagI18nKey(flag);
      return key ? store.i18n[key]() : flag;
    }

    return {
      load,
      optionName,
      flagLabel,

      setStateFilter(stateFilter: BoardStateFilter): void {
        patchState(store, { stateFilter });
      },
      setFlagFilter(flagFilter: string): void {
        patchState(store, { flagFilter });
      },

      /** «Auf Stripe umstellen»: monthly billing from today; the result names the options taken over from the enabled blocks. */
      async switchToStripe(row: BillingOverviewRow): Promise<void> {
        const tenant = row.name || row.tenantId;
        const res = await act<{ tenantId: string; billing: 'stripe' }, { ok: boolean; addedOptions: string[] }>(
          fill(store.i18n.board_to_stripe_confirm(), { tenant }), store.i18n.board_to_stripe(),
          'setTenantBilling', { tenantId: row.tenantId, billing: 'stripe' });
        if (!res?.ok) return;
        const added = res.addedOptions ?? [];
        const message = added.length > 0
          ? fill(store.i18n.board_to_stripe_done(), { tenant, options: added.map(optionName).join(', ') })
          : fill(store.i18n.board_to_stripe_done_none(), { tenant });
        await notify(store.alertController, store.i18n.board_to_stripe(), message, store.i18n.ok());
      },

      /** «Wieder aktivieren»: state active, clears the dunning dates and the run-failed flag. */
      async reactivate(row: BillingOverviewRow): Promise<void> {
        const res = await act<{ tenantId: string; state: 'active' }, { ok: boolean }>(
          fill(store.i18n.board_reactivate_confirm(), { tenant: row.name || row.tenantId }), store.i18n.board_reactivate(),
          'setTenantState', { tenantId: row.tenantId, state: 'active' });
        if (res?.ok) await showToast(store.toastController, store.i18n.board_saved());
      },

      /** «Hinweis entfernen»: removes one handled flag from the tenant's subscription (asks first). */
      async clearFlag(row: BillingOverviewRow, flag: string): Promise<void> {
        const request = clearFlagRequest(row.tenantId, flag);
        if (!request) return;
        const res = await act<typeof request, { ok: boolean }>(
          fill(store.i18n.board_flag_clear_confirm(), { flag: flagLabel(flag), tenant: row.name || row.tenantId }),
          store.i18n.board_flag_clear(), 'clearBillingFlags', request);
        if (res?.ok) await showToast(store.toastController, store.i18n.board_saved());
      },

      /** «Kündigen»: state cancelled; the monthly run no longer invoices the tenant. */
      async cancelSubscription(row: BillingOverviewRow): Promise<void> {
        const res = await act<{ tenantId: string; state: 'cancelled' }, { ok: boolean }>(
          fill(store.i18n.board_cancel_confirm(), { tenant: row.name || row.tenantId }), store.i18n.board_cancel(),
          'setTenantState', { tenantId: row.tenantId, state: 'cancelled' });
        if (res?.ok) await showToast(store.toastController, store.i18n.board_saved());
      },
    };
  }),
  withHooks((store) => ({
    onInit(): void {
      void store.load();
    },
  })),
);
