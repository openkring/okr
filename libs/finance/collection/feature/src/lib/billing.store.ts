// libs/finance/collection/feature/src/lib/billing.store.ts
import { computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import {
  AutoTopUp, BandId, BillingMode, CreditAccountCollection, CreditAccountModel, CreditEntry, CreditEntrySubcollection,
  SavedPaymentMethod, SubscriptionCollection, SubscriptionMeasurement, SubscriptionState,
} from '@okr/shared-models';
import { parseAmountToMinor } from '@okr/shared-ui';
import { confirm, okrPrompt, resourceParams, showToast } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { AutoTopUpModal, BillingEmailModal } from '@okr/finance-collection-ui';
import {
  aboStateKey, AutoTopUpFormModel, BillingEmailFormModel, COLLECTION_I18N_KEYS, CollectionI18n, formatChfAmount,
  MyBillingInvoice, nextInvoiceEstimate, optionI18nKey, optionRows, paymentMethodLabel, sameOptions, topUpAmountError,
  topUpBounds,
} from '@okr/finance-collection-util';

/** subscriptions/{tenantId} as read: every field may be missing on a doc written before it existed. */
type SubscriptionDoc = Partial<{
  paymentMethod: SavedPaymentMethod | null; autopay: boolean; autoTopUp: AutoTopUp;
  billing: BillingMode; state: SubscriptionState; options: string[]; currentBand: BandId | '';
  lastMeasurement: SubscriptionMeasurement | null; billingEmail: string;
}>;
/** One ledger line with its document id. */
export type CreditEntryRow = CreditEntry & { okey: string };

const AUTO_TOP_UP_OFF: AutoTopUp = { enabled: false, threshold: 0, amount: 0 };

interface BillingState {
  /** true while a callable runs: every action button is disabled, so nothing is started twice */
  busy: boolean;
  /** the tenant's own bkaiser invoices (listMyBillingInvoices), newest first */
  invoices: MyBillingInvoice[];
  invoicesLoading: boolean;
  /** true when listMyBillingInvoices failed: the list shows the generic error, not «Noch keine Rechnungen» */
  invoicesError: boolean;
  /**
   * The options setSubscriptionOptions just returned, until the live listener shows the same list: the next toggle
   * builds on them, so a quick second toggle never sends the stale list and drops the first. null = follow the doc.
   */
  pendingOptions: string[] | null;
}

/**
 * «Zahlung & Guthaben» (spec 1.149, plan 1 Task 10): the tenant's saved payment method, its prepaid credit and
 * ledger, and the auto top-up settings. Reads are live listeners on subscriptions/{tenantId} and
 * credit-accounts/{tenantId}(+entries), which only the tenant's admin may read (the route is admin-guarded). All writes
 * go through the billing callables; the Stripe webhook writes the method, so the page shows it once it lands.
 */
export const BillingStore = signalStore(
  withState<BillingState>({ busy: false, invoices: [], invoicesLoading: false, invoicesError: false, pendingOptions: null }),
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
    const sub = computed<SubscriptionDoc>(() => store.subscriptionResource.value() ?? {});
    const aboState = computed(() => aboStateKey(sub()));
    const liveOptions = computed(() => sub().options ?? []);
    const options = computed(() => store.pendingOptions() ?? liveOptions());
    const currentBand = computed(() => sub().currentBand ?? '');
    return {
      aboState,
      isExempt: computed(() => aboState() === 'exempt'),
      /** options can be booked while the tenant is billed and not ended */
      canChangeOptions: computed(() => ['active', 'pastDue', 'closing'].includes(aboState())),
      /** the next-invoice forecast only means something while the monthly run still invoices the tenant */
      showEstimate: computed(() => ['active', 'pastDue', 'closing'].includes(aboState())),
      liveOptions,
      currentBand,
      measurement: computed(() => sub().lastMeasurement ?? null),
      options,
      optionRows: computed(() => optionRows(options())),
      estimate: computed(() => nextInvoiceEstimate(currentBand(), options())),
      billingEmail: computed(() => sub().billingEmail ?? ''),
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
    /** The German (or current language) name of a paid option; the id itself when it has no name. */
    function optionName(id: string): string {
      const key = optionI18nKey(id);
      return key ? store.i18n[key]() : id;
    }

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
        const bounds = topUpBounds();
        const text = await okrPrompt(store.alertController, store.i18n.topup_header(),
          fill(store.i18n.topup_placeholder(), bounds), store.i18n.topup_next(), store.i18n.cancel());
        if (text === undefined || !text.trim()) return;
        const amount = parseAmountToMinor(text.trim());
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

      optionName,

      /**
       * Books (`on`) or cancels a paid option from next month, after a confirmation that names the price. Resolves to
       * whether the change was saved; the toggle reverts itself otherwise.
       */
      async setOption(id: string, on: boolean): Promise<boolean> {
        if (store.busy()) return false;
        const row = store.optionRows().find(r => r.id === id);
        if (!row || (on && !row.available)) return false;
        const message = on
          ? fill(store.i18n.abo_option_on_confirm(), { option: optionName(id), price: formatChfAmount(row.price * 100) })
          : fill(store.i18n.abo_option_off_confirm(), { option: optionName(id) });
        const ok = await confirm(store.alertController, message, store.i18n.ok(), store.i18n.cancel(), true);
        if (!ok) return false;
        const current = store.options();
        const options = on ? [...new Set([...current, id])] : current.filter(o => o !== id);
        const res = await call<{ options: string[] }, { options: string[] }>('setSubscriptionOptions', { options });
        if (!res) return false;
        patchState(store, { pendingOptions: Array.isArray(res.options) ? res.options : options });
        await showToast(store.toastController, store.i18n.abo_option_saved());
        return true;
      },

      /** «Rechnungs-E-Mail ändern»: the e-mail modal; saved through setBillingEmail. */
      async editBillingEmail(): Promise<void> {
        if (store.busy()) return;
        const modal = await store.modalController.create({
          component: BillingEmailModal,
          componentProps: { email: store.billingEmail() },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<BillingEmailFormModel>();
        if (role !== 'confirm' || !data?.email) return;
        const res = await call<BillingEmailFormModel, { email: string }>('setBillingEmail', { email: data.email });
        if (res?.email) await showToast(store.toastController, store.i18n.abo_email_saved());
      },

      /** Loads the tenant's own bkaiser invoices; a failure is logged and shown as the generic error. */
      async loadInvoices(): Promise<void> {
        patchState(store, { invoicesLoading: true, invoicesError: false });
        try {
          const res = await httpsCallable<Record<string, never>, MyBillingInvoice[]>(store.functions, 'listMyBillingInvoices')({});
          patchState(store, { invoices: Array.isArray(res.data) ? res.data : [] });
        } catch (e) {
          console.error('BillingStore: listMyBillingInvoices failed', e);
          patchState(store, { invoicesError: true });
        } finally {
          patchState(store, { invoicesLoading: false });
        }
      },

      /** «Online bezahlen»: the pay page of the invoice opens a fresh Stripe Checkout. */
      async payInvoice(invoiceKey: string): Promise<void> {
        if (store.busy() || !invoiceKey) return;
        await store.router.navigateByUrl(`/pay/${encodeURIComponent(invoiceKey)}`);
      },

      /**
       * «PDF»: opens the short-lived signed link. `win` is the blank tab the click handler opened synchronously — a
       * window.open after the callable is no longer a user gesture and would be blocked silently. It is opened without
       * noopener (a noopener tab cannot be navigated later), so the opener is cut here before it loads the link. When
       * the browser blocked the blank tab, a toast offers the link to tap (a tap is a fresh user gesture).
       */
      async openInvoicePdf(inv: MyBillingInvoice, win: Window | null): Promise<void> {
        const res = await call<{ invoiceKey: string }, { url: string }>('getMyBillingInvoicePdf', { invoiceKey: inv.invoiceKey });
        if (!res?.url) {
          win?.close();
          return;
        }
        if (win && !win.closed) {
          win.opener = null;
          win.location.href = res.url;
          return;
        }
        const url = res.url;
        const toast = await store.toastController.create({
          message: store.i18n.invoices_pdf_ready(),
          duration: 15000,
          buttons: [
            { text: store.i18n.invoices_pdf_open(), handler: () => { window.open(url, '_blank', 'noopener'); } },
            { text: store.i18n.cancel(), role: 'cancel' },
          ],
        });
        await toast.present();
      },
    };
  }),
  withHooks((store) => ({
    onInit(): void {
      void store.loadInvoices();
      // drop the pending options once the listener shows them (tracks both: the doc may land before the call returns)
      effect(() => {
        const pending = store.pendingOptions();
        if (pending && sameOptions(store.liveOptions(), pending)) patchState(store, { pendingOptions: null });
      });
    },
  })),
);
