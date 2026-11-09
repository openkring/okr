// libs/finance/collection/feature/src/lib/billing.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  AutoTopUp, CreditAccountCollection, CreditAccountModel, CreditEntry, CreditEntrySubcollection, SavedPaymentMethod,
  SubscriptionCollection,
} from '@okr/shared-models';
import { parseAmountToMinor } from '@okr/shared-ui';
import { confirm, okrPrompt, resourceParams, showToast } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';
import { AutoTopUpModal } from '@okr/finance-collection-ui';
import {
  AutoTopUpFormModel, COLLECTION_I18N_KEYS, CollectionI18n, formatChfAmount, paymentMethodLabel, topUpAmountError,
} from '@okr/finance-collection-util';

/** subscriptions/{tenantId} as read: every field may be missing on a doc written before it existed. */
type SubscriptionDoc = Partial<{ paymentMethod: SavedPaymentMethod | null; autopay: boolean; autoTopUp: AutoTopUp }>;
/** One ledger line with its document id. */
export type CreditEntryRow = CreditEntry & { okey: string };

const AUTO_TOP_UP_OFF: AutoTopUp = { enabled: false, threshold: 0, amount: 0 };

interface BillingState {
  /** true while a callable runs: every action button is disabled, so nothing is started twice */
  busy: boolean;
}

/**
 * «Zahlung & Guthaben» (spec 1.149, plan 1 Task 10): the tenant's saved payment method, its prepaid credit and
 * ledger, and the auto top-up settings. Reads are live listeners on subscriptions/{tenantId} and
 * credit-accounts/{tenantId}(+entries), which only the tenant's admin may read (the route is admin-guarded). All writes
 * go through the billing callables; the Stripe webhook writes the method, so the page shows it once it lands.
 */
export const BillingStore = signalStore(
  withState<BillingState>({ busy: false }),
  withProps(() => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      appStore,
      functions,
      firestoreService: inject(FirestoreService),
      router: inject(Router),
      modalController: inject(ModalController),
      alertController: inject(AlertController),
      toastController: inject(ToastController),
      i18n: inject(I18nService).translateAll(COLLECTION_I18N_KEYS) as CollectionI18n,
    };
  }),
  withProps((store) => {
    const params = resourceParams(() => ({ tenantId: store.appStore.tenantId() }));
    return {
      subscriptionResource: rxResource({
        params,
        stream: ({ params }) => params.tenantId
          ? store.firestoreService.readObjectQuiet<SubscriptionDoc>(`${SubscriptionCollection}/${params.tenantId}`)
          : of(undefined),
      }),
      accountResource: rxResource({
        params,
        stream: ({ params }) => params.tenantId
          ? store.firestoreService.readObjectQuiet<Partial<CreditAccountModel>>(`${CreditAccountCollection}/${params.tenantId}`)
          : of(undefined),
      }),
      entriesResource: rxResource({
        params,
        stream: ({ params }) => params.tenantId
          ? store.firestoreService.searchData<CreditEntryRow>(
            `${CreditAccountCollection}/${params.tenantId}/${CreditEntrySubcollection}`, [], 'date', 'desc')
          : of([] as CreditEntryRow[]),
      }),
    };
  }),
  withComputed((store) => {
    // Firestore reads skip model defaults: a missing doc, or a doc written before a field existed, coalesces here.
    const paymentMethod = computed(() => store.subscriptionResource.value()?.paymentMethod ?? null);
    const autoTopUp = computed<AutoTopUp>(() => ({ ...AUTO_TOP_UP_OFF, ...(store.subscriptionResource.value()?.autoTopUp ?? {}) }));
    return {
      paymentMethod,
      hasPaymentMethod: computed(() => !!paymentMethod()),
      paymentMethodLabel: computed(() => paymentMethodLabel(paymentMethod())),
      balance: computed(() => Number(store.accountResource.value()?.balance ?? 0)),
      entries: computed(() => store.entriesResource.value() ?? []),
      autoTopUp,
      isLoading: computed(() => store.subscriptionResource.isLoading() && !store.subscriptionResource.hasValue()),
    };
  }),
  withMethods((store) => {
    /** Runs one callable with the busy flag set; a failure is logged and toasted, and resolves to undefined. */
    async function call<Req, Res>(name: string, data: Req): Promise<Res | undefined> {
      if (store.busy()) return undefined;
      patchState(store, { busy: true });
      try {
        return (await httpsCallable<Req, Res>(store.functions, name)(data)).data;
      } catch (e) {
        console.error(`BillingStore: ${name} failed`, e);
        await showToast(store.toastController, store.i18n.error_generic());
        return undefined;
      } finally {
        patchState(store, { busy: false });
      }
    }

    return {
      /** «Ändern» / «Hinzufügen»: Stripe Checkout in setup mode; Stripe returns to /billing?stripe=done|cancel. */
      async changePaymentMethod(): Promise<void> {
        const res = await call<Record<string, never>, { url: string }>('createPaymentMethodSession', {});
        if (res?.url) {
          patchState(store, { busy: true }); // stays disabled while the browser leaves
          window.location.assign(res.url);
        }
      },

      async removePaymentMethod(): Promise<void> {
        if (!store.hasPaymentMethod()) return;
        const ok = await confirm(store.alertController, store.i18n.method_remove_confirm(), store.i18n.method_remove(), store.i18n.cancel(), true);
        if (!ok) return;
        const res = await call<Record<string, never>, { ok: boolean }>('removePaymentMethod', {});
        if (res?.ok) await showToast(store.toastController, store.i18n.method_removed());
      },

      /** «Guthaben aufladen»: one amount, a top-up invoice, then the pay page of that invoice. */
      async topUp(): Promise<void> {
        if (store.busy()) return;
        const bounds = { min: formatChfAmount(MIN_TOPUP), max: formatChfAmount(MAX_TOPUP) };
        const text = await okrPrompt(store.alertController, store.i18n.topup_header(),
          fill(store.i18n.topup_placeholder(), bounds), store.i18n.topup_next(), store.i18n.cancel());
        if (text === undefined || !text.trim()) return;
        const amount = parseAmountToMinor(text);
        if (topUpAmountError(amount)) {
          await showToast(store.toastController, fill(store.i18n.topup_amount_invalid(), bounds));
          return;
        }
        const res = await call<{ amount: number }, { invoiceKey: string; payUrl: string }>('createTopUpInvoice', { amount });
        if (res?.invoiceKey) await store.router.navigateByUrl(`/pay/${encodeURIComponent(res.invoiceKey)}`);
      },

      /** «Automatisch aufladen»: the settings modal; saved through setAutoTopUp. */
      async editAutoTopUp(): Promise<void> {
        if (store.busy()) return;
        const modal = await store.modalController.create({
          component: AutoTopUpModal,
          componentProps: { settings: store.autoTopUp(), hasPaymentMethod: store.hasPaymentMethod() },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<AutoTopUpFormModel>();
        if (role !== 'confirm' || !data) return;
        const res = await call<AutoTopUpFormModel, { ok: boolean }>('setAutoTopUp',
          { enabled: data.enabled, threshold: data.threshold, amount: data.amount });
        if (res?.ok) await showToast(store.toastController, store.i18n.autotopup_saved());
      },
    };
  }),
);
