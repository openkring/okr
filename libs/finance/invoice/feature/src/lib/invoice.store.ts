import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom, from, of } from 'rxjs';
import { take } from 'rxjs/operators';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AccountModel, DEFAULT_REMINDER_GRACE_DAYS, InvoiceCollection, InvoiceModel, InvoiceReminder, OrgModelName, PersonModelName } from '@okr/shared-models';
import { confirm, exportCsv, notify, resourceParams, showToast } from '@okr/shared-util-angular';
import {
  convertDateFormatToString, DateFormat, debugListLoaded, fill, getSystemQuery, getTodayStr, getYear, hasRole, nameMatches,
} from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { InvoiceEmailDraft, InvoiceService, ReminderPrintItem } from '@okr/finance-invoice-data-access';
import { InvoicePaymentModal, InvoiceReminderModal } from '@okr/finance-invoice-ui';
import {
  buildPaymentConfirmationPayload, canCreatePaymentConfirmation, canCreateReminder, canEmailInvoice, cancelInputProblem, configReminderFee, dunningTemplates, isPayableState,
  draftInvoicesOf, formatPaymentChf, invoiceDisplayState, invoicePaymentHints, invoicePaymentHintWindow, linkedInvoicePaymentKeys, getInvoiceExportData, INVOICE_CANCEL_REASON_LENGTH, INVOICE_I18N_KEYS, InvoiceI18n, InvoicePaymentCandidate,
  InvoicePaymentInput, invoiceRefusalReasons, invoiceRefusalText, invoicesForList, isDraftInvoice, isRetryablePaymentRefusal,
  mahnlaufCandidates, newDraftInvoice, newInvoicePaymentFormModel, newPaymentId, newReminderFormModel, openInvoiceAmount,
  PAYMENT_CONFIRMATION_TEMPLATE_ID, ReminderCandidate, reminderDisplayName, ReminderFormResult, waivableReminder, waiveInputProblem, WAIVE_REASON_MAX,
} from '@okr/finance-invoice-util';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReceiptParty } from '@okr/finance-booking-util';
import { downloadFromUrl } from '@okr/finance-reporting-util';
import { DocGenerationService, TemplateService } from '@okr/content-pdf-template-data-access';
// type-only: the composer itself is imported dynamically in sendDocument (no static edge into the ui lib)
import type { ComposedEmail } from '@okr/content-pdf-template-ui';
import { AddressService } from '@okr/subject-address-data-access';
import { getDirectoryPostalAddress, readsAddressVault } from '@okr/subject-address-util';
import { OrgService } from '@okr/subject-org-data-access';
import { PersonService } from '@okr/subject-person-data-access';

import { InvoiceEditModal, InvoiceEditResult } from './invoice-edit.modal';
import { MemberInvoiceService } from './member-invoice.service';

export type InvoiceState = {
  listId: string;         // 'all' | 'my' | personKey
  searchTerm: string;
  selectedState: string;  // 'all' | 'draft' | 'issuing' | 'pending' | 'paid' | 'cancelled'
  selectedYear: number;   // all is 99
  version: number;
};

/** Saves a base64 PDF (as the callables return it) as a file download. */
function saveBase64Pdf(content: string, filename: string): void {
  const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** A StoreDate as the user reads it (dd.MM.yyyy). */
function viewDate(storeDate: string): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate;
}

/** A label for an invoice in a summary: its number, else its receiver, else its title. */
function invoiceLabel(invoice: InvoiceModel): string {
  return invoice.invoiceId || invoice.receiver?.label || invoice.title || invoice.okey;
}

const initialState: InvoiceState = {
  listId: 'all',
  searchTerm: '',
  selectedState: 'all',
  selectedYear: getYear(),
  version: 0,
};

export const InvoiceStore = signalStore(
  withState(initialState),
  withProps((store) => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      invoiceService: inject(InvoiceService),
      accountService: inject(AccountService),
      memberInvoiceService: inject(MemberInvoiceService),
      addressService: inject(AddressService),
      personService: inject(PersonService),
      orgService: inject(OrgService),
      docGenerationService: inject(DocGenerationService),
      templateService: inject(TemplateService),
      appStore,
      accountingStore: inject(AccountingStore),
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      alertController: inject(AlertController),
      i18n: inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n,
      functions,
    };
  }),

  withProps((store) => ({
    allInvoicesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        accountingTenantId: store.accountingStore.accountingTenantId(),
        listId: store.listId(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.accountingTenantId) return of([]);
        // The 'my' list constrains receiver.key SERVER-side, not only in
        // filteredInvoices: the invoices rule now grants a plain member read access
        // to their own invoices only, and Firestore validates a list request against
        // the query, not the rows it happens to return. Without this where-clause the
        // whole query is denied for anyone below treasurer. Privileged screens keep
        // the unconstrained query (their read passes via the isPrivileged branch).
        const personKey = params.currentUser.personKey;
        if (params.listId === 'my' && !personKey) return of([]);
        return store.firestoreService.searchData<InvoiceModel>(
          InvoiceCollection,
          [
            ...getSystemQuery(store.appStore.tenantId()),
            { key: 'accountingTenantId', operator: '==' as const, value: params.accountingTenantId },
            ...(params.listId === 'my'
              ? [{ key: 'receiver.key', operator: '==' as const, value: personKey }]
              : []),
          ],
          'invoiceDate',
          'desc'
        ).pipe(debugListLoaded('InvoiceStore.allInvoices', params.currentUser));
      },
    }),
    /** every template of the tenant; the dunning ones are filtered in dunningTemplates (spec 1.90) */
    dunningTemplatesResource: rxResource({ stream: () => store.templateService.list() }),
  })),

  withComputed((store) => ({
    /** the open invoices of the books — the ones a payment can be recorded on */
    openInvoices: computed(() => (store.allInvoicesResource.value() ?? []).filter((i) => isPayableState(i.state) && openInvoiceAmount(i) > 0)),
    /** every payment booking already linked on an invoice of these books */
    linkedPaymentKeys: computed(() => linkedInvoicePaymentKeys(store.allInvoicesResource.value() ?? [])),
    // legacy config docs lack the field (Firestore reads skip model defaults)
    receivablesAccountKey: computed(() => store.accountingStore.config()?.receivablesAccountKey ?? ''),
    /** the templates a reminder may use: category dunning, published, not archived (spec 1.90) */
    dunningTemplates: computed(() => dunningTemplates(store.dunningTemplatesResource.value() ?? [])),
  })),

  /**
   * Payment hints (spec 1.86 phase 1, the twin of the bill hints): the posted bookings that credit the
   * receivables account with exactly the open amount of an open invoice. Read once per list load, only
   * while an open invoice exists and the books name a receivables account; a failed read shows no hints.
   */
  withProps((store) => ({
    // resourceParams: value-compared, so an invoice stream emission that changes nothing relevant does not re-read
    paymentCandidatesResource: rxResource({
      params: resourceParams(() => {
        const window = invoicePaymentHintWindow(store.openInvoices(), getTodayStr());
        return {
          accountingTenantId: store.accountingStore.accountingTenantId(),
          receivablesAccountKey: store.receivablesAccountKey(),
          fromDate: window?.from ?? '',
          toDate: window?.to ?? '',
          linkedKeys: store.linkedPaymentKeys().join(','),
          external: store.accountingStore.isExternallyManaged(),
          // only a treasurer can record the payment, and only the books' full list knows every linked
          // booking — «Meine Rechnungen» holds the member's own invoices, so its hints would be wrong
          enabled: hasRole('treasurer', store.appStore.currentUser()) && store.listId() !== 'my',
        };
      }),
      stream: ({ params }) => {
        if (!params.enabled || !params.receivablesAccountKey || !params.fromDate || params.external) return of([] as InvoicePaymentCandidate[]);
        return from(store.invoiceService.listPaymentHintCandidates(params.accountingTenantId, params.receivablesAccountKey,
          params.linkedKeys ? params.linkedKeys.split(',') : [], params.fromDate, params.toDate)
          .catch((e) => {
            console.error('InvoiceStore.paymentCandidates: loading the bookings failed', e);
            return [] as InvoicePaymentCandidate[];
          }));
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allInvoicesResource.isLoading()),
    /** invoiceKey → candidate booking of the likely payment */
    paymentHints: computed(() => {
      const candidates = store.paymentCandidatesResource.value() ?? [];
      const byKey = new Map(candidates.map((c) => [c.bookingKey, c]));
      const hints = new Map<string, InvoicePaymentCandidate>();
      const window = invoicePaymentHintWindow(store.openInvoices(), getTodayStr());
      for (const [invoiceKey, bookingKey] of invoicePaymentHints(window?.invoices ?? [], candidates)) {
        const candidate = byKey.get(bookingKey);
        if (candidate) hints.set(invoiceKey, candidate);
      }
      return hints;
    }),
    currentUser: computed(() => store.appStore.currentUser()),
    isExternallyManaged: computed(() => store.accountingStore.isExternallyManaged()),
    states: computed(() => store.appStore.getCategory('invoice_state')),

    /**
     * The invoices a Mahnlauf would remind (spec 1.76 phase 3): the due ones of the current list, the
     * longest overdue first. Legacy config docs lack the grace days (Firestore reads skip model defaults).
     */
    mahnlaufInvoices: computed(() => {
      const invoices = invoicesForList(store.allInvoicesResource.value() ?? [], store.listId(), store.appStore.currentUser()?.personKey);
      const graceDays = store.accountingStore.config()?.reminderGraceDays ?? DEFAULT_REMINDER_GRACE_DAYS;
      return mahnlaufCandidates(invoices, getTodayStr(), graceDays);
    }),

    filteredInvoices: computed(() => {
      let invoices = store.allInvoicesResource.value() ?? [];

      // filter by listId; receiver views ('my', a person key) never show drafts or issuing invoices
      invoices = invoicesForList(invoices, store.listId(), store.appStore.currentUser()?.personKey);

      // filter by state
      const selectedState = store.selectedState();
      if (selectedState !== 'all') {
        // 'overdue' is computed (open and past due), so filter on the state the list shows
        const today = getTodayStr();
        invoices = invoices.filter(i => invoiceDisplayState(i, today) === selectedState);
      }

      // filter by year
      const selectedYear = store.selectedYear();
      if (selectedYear !== 99) {
        invoices = invoices.filter(i => i.invoiceDate.startsWith(selectedYear + ''));
      }

      // filter by search term
      const searchTerm = store.searchTerm().toLowerCase();
      if (searchTerm) {
        invoices = invoices.filter(i => nameMatches(i.index, searchTerm));
      }

      return invoices;
    }),
  })),

  withMethods((store) => ({     
    /******************************** setters (filter) ******************************************* */
    setListId(listId: string): void {
      patchState(store, { listId });
    },

    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setSelectedState(selectedState: string): void {
      patchState(store, { selectedState });
    },

    setSelectedYear(selectedYear: number): void {
      patchState(store, { selectedYear });
    },

    /******************************** getters ******************************************* */

    /******************************** actions ******************************************* */
    async add(): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      const invoice = newDraftInvoice(store.appStore.tenantId(), store.accountingStore.accountingTenantId(), getTodayStr());
      const modal = await store.modalController.create({
        component: InvoiceEditModal,
        cssClass: 'wide-modal',
        componentProps: {
          invoice,
          currentUser: store.appStore.currentUser(),
          isNew: true,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<InvoiceEditResult>();
      if (role === 'confirm' && data) {
        await store.memberInvoiceService.createDraft(data);
        patchState(store, { version: store.version() + 1 });
      }
    },

    /** Opens an invoice in the edit modal; it is editable only while it is a draft. */
    async edit(invoice: InvoiceModel, readOnly = false): Promise<void> {
      const modal = await store.modalController.create({
        component: InvoiceEditModal,
        cssClass: 'wide-modal',
        componentProps: {
          invoice: { ...invoice },
          currentUser: store.appStore.currentUser(),
          isNew: false,
          readOnly: readOnly || !isDraftInvoice(invoice) || store.accountingStore.isExternallyManaged(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<InvoiceEditResult>();
      if (role === 'confirm' && data) {
        try {
          await store.invoiceService.update(data.invoice, data.positions, store.appStore.currentUser() ?? undefined);
          await showToast(store.toastController, store.i18n.update_conf());
        } catch (e) {
          console.error('InvoiceStore.edit: writeInvoice failed', e);
          await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.update_error()));
        }
        patchState(store, { version: store.version() + 1 });
      }
    },

    async view(invoice: InvoiceModel): Promise<void> {
      const { InvoiceViewModal } = await import('./invoice-view.modal');
      const modal = await store.modalController.create({
        component: InvoiceViewModal,
        componentProps: {
          invoice: { ...invoice }
        },
      });
      await modal.present();
    },

    /** Deletes a draft with its positions (the server refuses anything else). */
    async delete(invoice: InvoiceModel): Promise<void> {
      if (!isDraftInvoice(invoice)) return;
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        await store.invoiceService.delete(invoice, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.delete_conf());
      } catch (e) {
        console.error('InvoiceStore.delete: writeInvoice failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.delete_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Issues a draft (spec 1.76): it gets its number, its PDF and its Debitoren booking, and cannot be
     * changed afterwards — hence the confirmation. A refusal names its reason in a friendly toast.
     */
    async issue(invoice: InvoiceModel): Promise<void> {
      if (!isDraftInvoice(invoice) && invoice.state !== 'issuing') return;
      const confirmed = await confirm(store.alertController, store.i18n.issue_confirm(), store.i18n.issue(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        const result = await store.invoiceService.issue(invoice.okey, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, fill(store.i18n.issue_conf(), { invoiceId: String(result.invoiceNo) }));
      } catch (e) {
        console.error('InvoiceStore.issue: issueInvoice failed', e);
        // an alert, not a toast: the treasurer must see that nothing was issued or sent, and why
        const reason = invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, '');
        await notify(store.alertController, store.i18n.issue(), [store.i18n.issue_error(), reason].filter(t => !!t).join(' '), store.i18n.ok());
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Records a received payment on an issued invoice (spec 1.76 phase 2): opens the payment dialog,
     * then calls `recordInvoicePayment`. One `paymentId` per dialog: when the call fails with a reason
     * the treasurer can fix (or no reason at all — a network error), the dialog opens again with the
     * entered values and the same id, so a payment that did reach the server is not booked twice.
     * @param preselect the hinted booking (spec 1.86): the dialog opens in mode link with it selected
     */
    async recordPayment(invoice: InvoiceModel, preselect?: InvoicePaymentCandidate): Promise<void> {
      if (!isPayableState(invoice.state) || store.accountingStore.isExternallyManaged()) return;
      const config = store.accountingStore.config();
      if (!config) {
        await showToast(store.toastController, store.i18n.refusal_no_accounting_config());
        return;
      }
      // legacy config docs lack the phase-2 fields (Firestore reads skip model defaults)
      const paymentAccountKeys = config.invoicePaymentAccountKeys ?? [];
      const receivablesAccountKey = config.receivablesAccountKey ?? '';
      let accounts: AccountModel[] = [];
      try {
        accounts = paymentAccountKeys.length > 0
          ? await firstValueFrom(store.accountService.list(invoice.accountingTenantId).pipe(take(1)))
          : [];
      } catch (e) {
        console.error('InvoiceStore.recordPayment: loading the accounts failed', e);
        await showToast(store.toastController, store.i18n.payment_error());
        return;
      }
      // The link candidates are read only when the dialog shows mode link, once per dialog; a failed
      // read is forgotten so that a reopened dialog tries again.
      let candidatesRead: Promise<InvoicePaymentCandidate[]> | undefined;
      const loadCandidates = (): Promise<InvoicePaymentCandidate[]> =>
        candidatesRead ??= store.invoiceService.listPaymentCandidates(invoice, receivablesAccountKey).catch((e) => {
          candidatesRead = undefined;
          throw e;
        });
      const paymentAccounts = accounts.filter((a) => paymentAccountKeys.includes(a.okey));
      const paymentId = newPaymentId();
      let payment = newInvoicePaymentFormModel(invoice, getTodayStr(), paymentAccounts.map((a) => a.okey), preselect);

      for (;;) {
        const modal = await store.modalController.create({
          component: InvoicePaymentModal,
          componentProps: { payment, accounts: paymentAccounts, loadCandidates },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<InvoicePaymentInput>();
        if (role !== 'confirm' || !data) return;
        try {
          const result = await store.invoiceService.recordPayment(invoice.okey, data, paymentId, store.appStore.currentUser() ?? undefined);
          // derived from the callable's answer: a re-read right after the write may still be the old snapshot
          const open = openInvoiceAmount({ totalAmount: invoice.totalAmount, payments: result.payments, reminders: invoice.reminders });
          await showToast(store.toastController, result.state === 'paid'
            ? store.i18n.payment_conf_paid()
            : fill(store.i18n.payment_conf(), { open: formatPaymentChf(open) }));
          patchState(store, { version: store.version() + 1 });
          return;
        } catch (e) {
          console.error('InvoiceStore.recordPayment: recordInvoicePayment failed', e);
          const reasons = invoiceRefusalReasons(e);
          await showToast(store.toastController, invoiceRefusalText(reasons, store.i18n, store.i18n.payment_error(), 'payment'));
          if (!isRetryablePaymentRefusal(reasons)) {
            patchState(store, { version: store.version() + 1 });
            return;
          }
          const candidates = data.mode === 'link' ? await loadCandidates().catch(() => [] as InvoicePaymentCandidate[]) : [];
          const candidate = candidates.find((c) => c.bookingKey === data.bookingKey);
          payment = {
            ...payment, mode: data.mode, date: data.date, amount: data.amount,
            bankAccountKey: data.bankAccountKey || payment.bankAccountKey, bookingKey: data.bookingKey,
            // a booking the dialog's read does not list (e.g. the hint) keeps the amount it was opened with
            bookingAmount: candidate ? candidate.creditedAmount / 100 : (data.bookingKey === payment.bookingKey ? payment.bookingAmount : 0),
          };
        }
      }
    },

    /**
     * Cancels an issued, unpaid invoice (spec 1.76 phase 2): asks for the reason and the date (today
     * by default), then `cancelInvoice` writes the reversal booking. The server refuses invoices with
     * payments and migrated bexio invoices; the toast says why.
     */
    async cancelInvoice(invoice: InvoiceModel): Promise<void> {
      if (invoice.state !== 'pending' || store.accountingStore.isExternallyManaged()) return;
      const today = getTodayStr(DateFormat.IsoDate);
      const message = store.i18n.cancel_invoice_message();
      let input: { reason: string; date: string } | undefined;
      const alert = await store.alertController.create({
        header: store.i18n.cancel_invoice(),
        message,
        inputs: [
          { name: 'reason', type: 'textarea', placeholder: store.i18n.cancel_invoice_reason(),
            attributes: { maxlength: INVOICE_CANCEL_REASON_LENGTH, 'aria-label': store.i18n.cancel_invoice_reason() } },
          { name: 'date', type: 'date', value: today, attributes: { 'aria-label': store.i18n.cancel_invoice_date() } },
        ],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          {
            text: store.i18n.cancel_invoice_ok(),
            role: 'confirm',
            handler: (values: { reason?: string; date?: string }) => {
              const reason = (values?.reason ?? '').trim();
              const date = values?.date ? (convertDateFormatToString(values.date, DateFormat.IsoDate, DateFormat.StoreDate, false) || '') : '';
              const problem = cancelInputProblem(reason, date, invoice.invoiceDate);
              if (problem) {
                // keep the alert open and say what is missing
                const hint = problem === 'reason' ? store.i18n.cancel_invoice_reason_invalid()
                  : problem === 'before-invoice' ? store.i18n.refusal_storno_before_invoice()
                  : store.i18n.cancel_invoice_date_invalid();
                alert.message = `${message} ${hint}`;
                return false;
              }
              input = { reason, date };
              return true;
            },
          },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !input) return;
      try {
        await store.invoiceService.cancel(invoice.okey, input.date, input.reason, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.cancel_invoice_conf());
      } catch (e) {
        console.error('InvoiceStore.cancelInvoice: cancelInvoice failed', e);
        await showToast(store.toastController,
          invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.cancel_invoice_error(), 'cancel'));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Waives the fee of the latest waivable reminder (spec 1.76 D18): asks for the date (today by
     * default) and a reason, then `waiveReminderFee` books the fee back. The toast comes from the
     * callable's answer (open amount, or "now paid").
     */
    async waiveReminderFee(invoice: InvoiceModel): Promise<void> {
      const reminder = waivableReminder(invoice);
      if (!reminder || store.accountingStore.isExternallyManaged() !== false) return;
      const levelLabel = this.reminderName(reminder);
      const message = store.i18n.waive_fee_message();
      let input: { reason: string; date: string } | undefined;
      const alert = await store.alertController.create({
        header: fill(store.i18n.waive_fee_header(), { level: levelLabel }),
        message,
        inputs: [
          { name: 'reason', type: 'textarea', placeholder: store.i18n.waive_fee_reason(),
            attributes: { maxlength: WAIVE_REASON_MAX, 'aria-label': store.i18n.waive_fee_reason() } },
          { name: 'date', type: 'date', value: getTodayStr(DateFormat.IsoDate), attributes: { 'aria-label': store.i18n.waive_fee_date() } },
        ],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          {
            text: store.i18n.waive_fee_ok(),
            role: 'confirm',
            handler: (values: { reason?: string; date?: string }) => {
              const reason = (values?.reason ?? '').trim();
              const date = values?.date ? (convertDateFormatToString(values.date, DateFormat.IsoDate, DateFormat.StoreDate, false) || '') : '';
              const problem = waiveInputProblem(reason, date);
              if (problem) {
                // keep the alert open and say what is missing
                alert.message = `${message} ${problem === 'reason' ? store.i18n.waive_fee_reason_invalid() : store.i18n.waive_fee_date_invalid()}`;
                return false;
              }
              input = { reason, date };
              return true;
            },
          },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !input) return;
      try {
        const result = await store.invoiceService.waiveReminderFee(invoice.okey, reminder.level, input.date, input.reason, store.appStore.currentUser() ?? undefined);
        // derived from the callable's answer: a re-read right after the write may still be the old snapshot
        const fee = formatPaymentChf(result.reminder?.fee ?? reminder.fee);
        await showToast(store.toastController, result.state === 'paid'
          ? fill(store.i18n.waive_fee_conf_paid(), { fee })
          : fill(store.i18n.waive_fee_conf(), { fee, open: formatPaymentChf(result.openAmount) }));
      } catch (e) {
        console.error('InvoiceStore.waiveReminderFee: waiveReminderFee failed', e);
        await showToast(store.toastController,
          invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.waive_fee_error(), 'waive'));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /** The drafts "Alle Entwürfe ausstellen" would issue: the drafts of the current list. */
    draftsToIssue(): InvoiceModel[] {
      const invoices = invoicesForList(store.allInvoicesResource.value() ?? [], store.listId(), store.appStore.currentUser()?.personKey);
      return draftInvoicesOf(invoices);
    },

    /**
     * Issues every draft of the list, one after the other (spec 1.76 phase 2). A refusal does not stop
     * the run: it is collected and named in one summary at the end, next to the number issued.
     */
    async issueAllDrafts(): Promise<void> {
      if (store.accountingStore.isExternallyManaged() || !hasRole('treasurer', store.appStore.currentUser())) return;
      const drafts = this.draftsToIssue();
      if (drafts.length === 0) return;
      const confirmed = await confirm(store.alertController, fill(store.i18n.issue_all_confirm(), { count: drafts.length }),
        store.i18n.issue(), store.i18n.cancel(), true);
      if (!confirmed) return;

      const progress = await store.toastController.create({ message: fill(store.i18n.issue_all_progress(), { n: 0, m: drafts.length }) });
      await progress.present();
      let issued = 0;
      const failures: string[] = [];
      for (const [i, draft] of drafts.entries()) {
        progress.message = fill(store.i18n.issue_all_progress(), { n: i + 1, m: drafts.length });
        try {
          await store.invoiceService.issue(draft.okey, store.appStore.currentUser() ?? undefined);
          issued++;
        } catch (e) {
          console.error(`InvoiceStore.issueAllDrafts: issueInvoice failed for ${draft.okey}`, e);
          failures.push(`${invoiceLabel(draft)}: ${invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.issue_error())}`);
        }
      }
      await progress.dismiss();
      patchState(store, { version: store.version() + 1 });

      const done = fill(store.i18n.issue_all_done(), { issued, total: drafts.length });
      const summary = failures.length > 0 ? `${done} ${store.i18n.issue_all_failed()} ${failures.join(' · ')}` : done;
      await confirm(store.alertController, summary, store.i18n.ok(), store.i18n.cancel(), false);
    },

    /** "Rechnung 202600001" — how a confirm alert or toast names the invoice PDF. */
    invoiceDocumentLabel(invoice: InvoiceModel): string {
      return fill(store.i18n.document_invoice(), { invoiceId: invoice.invoiceId || invoice.okey });
    },

    /** A reminder's name: its template name, else the 1.76 level naming (spec 1.90 D7). */
    reminderName(reminder: { level: number; templateName?: string }): string {
      return reminderDisplayName(reminder, store.i18n);
    },

    /** "Mahnung zu Rechnung 202600001" — how a confirm alert or toast names a reminder PDF. */
    reminderDocumentLabel(invoice: InvoiceModel, reminder: { level: number; templateName?: string }): string {
      return fill(store.i18n.document_reminder(), { level: this.reminderName(reminder), invoiceId: invoice.invoiceId || invoice.okey });
    },

    /**
     * Downloads a signed print PDF of reminders (merged, the invoice attached on request) from
     * `getReminderPrintPdf`; falls back to opening the link when the blob download is blocked.
     * @returns false when the PDF could not be made (the toast says why)
     */
    async downloadPrint(items: ReminderPrintItem[]): Promise<boolean> {
      try {
        const { url, filename } = await store.invoiceService.getReminderPrintPdf(items);
        const saved = await downloadFromUrl(url, filename);
        if (!saved) window.open(url, '_blank');
        return true;
      } catch (e) {
        console.error('InvoiceStore.downloadPrint: getReminderPrintPdf failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.reminder_show_error(), 'reminder'));
        return false;
      }
    },

    /**
     * Creates a reminder of an open invoice (spec 1.90): the reminder dialog asks for the dunning template,
     * date, fee, channel and whether to attach the invoice; `createInvoiceReminder` renders the PDF and books
     * the fee. The toast names the open amount from the callable's answer; then the reminder goes out by
     * email (composer) or by post (print PDF, then marked as posted on confirmation).
     */
    async createReminder(invoice: InvoiceModel): Promise<void> {
      if (!canCreateReminder(invoice) || store.accountingStore.isExternallyManaged() !== false) return;
      const config = store.accountingStore.config();
      if (!config) {
        await showToast(store.toastController, store.i18n.refusal_no_accounting_config());
        return;
      }
      const templates = store.dunningTemplates();
      const feeRappen = configReminderFee(config);
      // legacy config docs lack the field (Firestore reads skip model defaults)
      const model = newReminderFormModel(templates, config.reminderTemplateId ?? '', feeRappen, openInvoiceAmount(invoice), getTodayStr());
      const modal = await store.modalController.create({
        component: InvoiceReminderModal,
        componentProps: { model, templates, configFeeRappen: feeRappen },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ReminderFormResult>();
      if (role !== 'confirm' || !data) return;

      let reminder: InvoiceReminder | undefined;
      try {
        const result = await store.invoiceService.createReminder(invoice.okey, { templateId: data.templateId, date: data.date, feeChf: data.feeChf },
          crypto.randomUUID(), store.appStore.currentUser() ?? undefined);
        reminder = result.reminder;
        // derived from the callable's answer: a re-read right after the write may still be the old snapshot
        await showToast(store.toastController, fill(store.i18n.reminder_conf(), {
          document: data.templateName, date: viewDate(result.reminder?.date ?? data.date), open: formatPaymentChf(result.openAmount),
        }));
      } catch (e) {
        console.error('InvoiceStore.createReminder: createInvoiceReminder failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.reminder_error(), 'reminder'));
        patchState(store, { version: store.version() + 1 });
        return;
      }
      patchState(store, { version: store.version() + 1 });
      if (!reminder?.documentKey) return;
      if (data.channel === 'email') {
        await this.sendDocument(invoice, reminder.documentKey, this.reminderDocumentLabel(invoice, reminder), data.attachInvoice);
      } else {
        await this.printAndMarkPosted(invoice, [{ invoiceKey: invoice.okey, documentKey: reminder.documentKey, attachInvoice: data.attachInvoice }]);
      }
    },

    /** Prints the reminders (merged in chunks of 50, invoice attached on request), then asks once whether they went out by post. */
    async printAndMarkPosted(invoice: InvoiceModel | undefined, items: ReminderPrintItem[]): Promise<void> {
      if (items.length === 0) return;
      for (let i = 0; i < items.length; i += 50) {
        if (!(await this.downloadPrint(items.slice(i, i + 50)))) return;
      }
      const question = items.length === 1 ? store.i18n.reminder_post_confirm() : fill(store.i18n.reminder_post_confirm_all(), { count: items.length });
      const posted = await confirm(store.alertController, question, store.i18n.email_post_ok(), store.i18n.reminder_later(), true);
      if (!posted) return;
      const currentUser = store.appStore.currentUser() ?? undefined;
      const failed: string[] = [];
      for (const item of items) {
        try {
          await store.invoiceService.markSentByPost(item.invoiceKey, currentUser, item.documentKey);
        } catch (e) {
          console.error(`InvoiceStore.printAndMarkPosted: markInvoiceSent failed for ${item.invoiceKey}`, e);
          failed.push(invoice?.okey === item.invoiceKey ? invoiceLabel(invoice) : item.invoiceKey);
        }
      }
      patchState(store, { version: store.version() + 1 });
      await showToast(store.toastController, failed.length === 0 ? store.i18n.reminder_post_conf() : `${store.i18n.email_post_error()} ${failed.join(', ')}`);
    },

    /** Mails the invoice PDF (spec 1.76 D12) through the email composer. */
    async sendInvoiceEmail(invoice: InvoiceModel): Promise<void> {
      if (!canEmailInvoice(invoice) || store.accountingStore.isExternallyManaged() !== false) return;
      await this.sendDocument(invoice, invoice.documentKey, this.invoiceDocumentLabel(invoice));
    },

    /** Mails one reminder PDF through the email composer, the invoice attached on request. */
    async sendReminderEmail(invoice: InvoiceModel, reminder: InvoiceReminder, attachInvoice = false): Promise<void> {
      // a paid or cancelled invoice gets no reminder mail (the server refuses it too)
      if (!isPayableState(invoice.state) || store.accountingStore.isExternallyManaged() !== false || !reminder.documentKey) return;
      await this.sendDocument(invoice, reminder.documentKey, this.reminderDocumentLabel(invoice, reminder), attachInvoice);
    },

    /** Downloads one reminder PDF (signed print link, no invoice attached). */
    async downloadReminderPdf(invoice: InvoiceModel, reminder: InvoiceReminder): Promise<void> {
      if (!reminder.documentKey) return;
      await this.downloadPrint([{ invoiceKey: invoice.okey, documentKey: reminder.documentKey, attachInvoice: false }]);
    },

    /** Records that one reminder was printed and sent by post today. */
    async markReminderPosted(invoice: InvoiceModel, reminder: InvoiceReminder): Promise<void> {
      if (!reminder.documentKey) return;
      const ok = await confirm(store.alertController, store.i18n.reminder_post_confirm(), store.i18n.email_post_ok(), store.i18n.cancel(), true);
      if (!ok) return;
      try {
        await store.invoiceService.markSentByPost(invoice.okey, store.appStore.currentUser() ?? undefined, reminder.documentKey);
        await showToast(store.toastController, store.i18n.reminder_post_conf());
      } catch (e) {
        console.error('InvoiceStore.markReminderPosted: markInvoiceSent failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_post_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Sends one document of an invoice by email through the email composer: it opens with the server's
     * suggestion (the receiver's favourite email, the tenant sender, the fixed subject and body) and the
     * treasurer may change recipients (to/cc/bcc), sender, subject and body or add files. The server attaches
     * the PDF (and the invoice PDF when `attachInvoice`) and marks the invoice/reminder as sent. A send is not
     * idempotent, so a failure is reported in the composer and not retried.
     */
    async sendDocument(invoice: InvoiceModel, documentKey: string, label: string, attachInvoice = false): Promise<void> {
      let draft: InvoiceEmailDraft;
      try {
        draft = await store.invoiceService.getEmailDraft(invoice.okey, documentKey, attachInvoice);
      } catch (e) {
        console.error('InvoiceStore.sendDocument: getInvoiceEmailDraft failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_error(), 'email'));
        return;
      }
      const currentUser = store.appStore.currentUser() ?? undefined;
      const sendHandler = async (mail: ComposedEmail): Promise<void> => {
        try {
          await store.invoiceService.sendEmail(invoice.okey, documentKey, currentUser, mail, attachInvoice);
        } catch (e) {
          console.error('InvoiceStore.sendDocument: sendInvoiceEmail failed', e);
          // the composer shows this text and stays open
          throw new Error(invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_error(), 'email'));
        }
      };
      // dynamic: the composer lib is only needed once somebody sends a mail
      const { EmailComposerModal } = await import('@okr/content-pdf-template-ui');
      const modal = await store.modalController.create({
        component: EmailComposerModal,
        componentProps: {
          to: draft.to,
          fromDefault: draft.from,
          subjectDefault: draft.subject,
          bodyDefault: draft.body,
          filename: draft.filename || `${label}.pdf`,
          sendHandler,
        },
        cssClass: 'wide-modal',
      });
      await modal.present();
      await modal.onDidDismiss();
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Mahnlauf (spec 1.90): the reminder dialog lists the due invoices of the list (all selected) and asks
     * once for template, date, fee, channel and attachment; then a reminder is created for every selected
     * invoice, one after the other. Email: each one is mailed right away (no composer). Post: the PDFs are
     * printed merged at the end, then marked as posted on confirmation. A refusal does not stop the run;
     * a failed send does not undo its reminder and is listed on its own in the summary.
     */
    async runMahnlauf(): Promise<void> {
      if (store.accountingStore.isExternallyManaged() !== false || !hasRole('treasurer', store.appStore.currentUser())) return;
      const due = store.mahnlaufInvoices();
      const config = store.accountingStore.config();
      if (due.length === 0 || !config) return;
      const templates = store.dunningTemplates();
      const feeRappen = configReminderFee(config);
      const candidates: ReminderCandidate[] = due.map((invoice) => {
        const last = [...(invoice.reminders ?? [])].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
        return {
          key: invoice.okey, label: invoiceLabel(invoice), openAmountChf: openInvoiceAmount(invoice) / 100,
          lastReminder: last ? `${this.reminderName(last)} ${viewDate(last.date)}` : '',
        };
      });
      // legacy config docs lack the field (Firestore reads skip model defaults)
      const model = newReminderFormModel(templates, config.reminderTemplateId ?? '', feeRappen, 0, getTodayStr(), due.map((i) => i.okey));
      const modal = await store.modalController.create({
        component: InvoiceReminderModal,
        componentProps: { model, templates, configFeeRappen: feeRappen, candidates },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<ReminderFormResult>();
      if (role !== 'confirm' || !data) return;

      const selected = due.filter((i) => data.selectedKeys.includes(i.okey));
      if (selected.length === 0) return;
      const currentUser = store.appStore.currentUser() ?? undefined;
      const progress = await store.toastController.create({ message: fill(store.i18n.mahnlauf_progress(), { n: 0, m: selected.length }) });
      await progress.present();
      let created = 0;
      let sent = 0;
      const failures: string[] = [];
      const sendFailures: string[] = [];
      const toPrint: ReminderPrintItem[] = [];
      for (const [i, invoice] of selected.entries()) {
        progress.message = fill(store.i18n.mahnlauf_progress(), { n: i + 1, m: selected.length });
        let documentKey = '';
        try {
          const result = await store.invoiceService.createReminder(invoice.okey, { templateId: data.templateId, date: data.date, feeChf: data.feeChf },
            crypto.randomUUID(), currentUser);
          created++;
          documentKey = result.reminder?.documentKey ?? '';
        } catch (e) {
          console.error(`InvoiceStore.runMahnlauf: createInvoiceReminder failed for ${invoice.okey}`, e);
          failures.push(`${invoiceLabel(invoice)}: ${invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.reminder_error(), 'reminder')}`);
          continue;
        }
        if (!documentKey) {
          sendFailures.push(`${invoiceLabel(invoice)}: ${store.i18n.refusal_no_document()}`);
          continue;
        }
        if (data.channel === 'post') {
          toPrint.push({ invoiceKey: invoice.okey, documentKey, attachInvoice: data.attachInvoice });
          continue;
        }
        try {
          await store.invoiceService.sendEmail(invoice.okey, documentKey, currentUser, undefined, data.attachInvoice);
          sent++;
        } catch (e) {
          console.error(`InvoiceStore.runMahnlauf: sendInvoiceEmail failed for ${invoice.okey}`, e);
          sendFailures.push(`${invoiceLabel(invoice)}: ${invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_error(), 'email')}`);
        }
      }
      await progress.dismiss();
      patchState(store, { version: store.version() + 1 });

      const parts = [fill(store.i18n.mahnlauf_done(), { created, total: selected.length })];
      if (data.channel === 'email') parts.push(fill(store.i18n.mahnlauf_sent(), { sent }));
      if (failures.length > 0) parts.push(`${store.i18n.mahnlauf_failed()} ${failures.join(' · ')}`);
      if (sendFailures.length > 0) parts.push(`${store.i18n.mahnlauf_send_failed()} ${sendFailures.join(' · ')}`);
      await confirm(store.alertController, parts.join(' '), store.i18n.ok(), store.i18n.cancel(), false);
      if (toPrint.length > 0) await this.printAndMarkPosted(undefined, toPrint);
    },

    async export(type: string, invoices: InvoiceModel[]): Promise<void> {
      if (type === 'raw') {
        await exportCsv(getInvoiceExportData(invoices), 'invoices.xlsx', 'Invoices');
      }
    },

    /** A draft as PDF (spec: draft preview): rendered on the server, nothing numbered or booked. */
    async preview(invoice: InvoiceModel): Promise<void> {
      if (!isDraftInvoice(invoice)) return;
      try {
        const result = await store.invoiceService.preview(invoice.okey);
        saveBase64Pdf(result.content, `Entwurf-${invoice.okey}.pdf`);
      } catch (e) {
        console.error('InvoiceStore.preview: previewInvoicePdf failed', e);
        const reason = invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, '');
        await notify(store.alertController, store.i18n.show_preview(), [store.i18n.show_preview_error(), reason].filter(t => !!t).join(' '), store.i18n.ok());
      }
    },

    /** Records that an issued invoice was printed and sent by post today. */
    async markSentByPost(invoice: InvoiceModel): Promise<void> {
      if (!canEmailInvoice(invoice)) return;
      const confirmed = await confirm(store.alertController, store.i18n.email_post_confirm(), store.i18n.email_post_ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        await store.invoiceService.markSentByPost(invoice.okey, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.email_post_conf());
      } catch (e) {
        console.error('InvoiceStore.markSentByPost: markInvoiceSent failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_post_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    async showPdf(invoice: InvoiceModel): Promise<void> {
      try {
        const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
          store.functions, 'showInvoicePdf'
        );
        const result = await fn({ invoiceId: invoice.okey });
        saveBase64Pdf(result.data.content, `${invoice.invoiceId}.pdf`);
      } catch (e) {
        // Without this the callable's rejection escapes as an unhandled promise
        // rejection: the user sees nothing at all, the failure only lands in Sentry
        // (SCS-A0). Bexio can be unreachable, and the callable still rejects for
        // anyone who is neither the recipient nor treasurer/privileged.
        console.error('InvoiceStore.showPdf: failed to fetch the PDF', e);
        const reason = (e as { details?: { reason?: string } })?.details?.reason;
        await showToast(store.toastController, reason === 'no-pdf' ? store.i18n.show_pdf_missing() : store.i18n.show_pdf_error());
      }
    },

    /**
     * The payment confirmation of a paid invoice as PDF download. Native books: rendered and filed as
     * voucher by the `createPaymentConfirmation` callable (spec 1.76 phase 2). Books kept in bexio:
     * rendered here from the invoice, its receiver and the receiver's postal address (legacy path).
     */
    async createPaymentConfirmation(invoice: InvoiceModel): Promise<void> {
      if (!canCreatePaymentConfirmation(invoice)) return;
      if (store.accountingStore.isExternallyManaged() === false) {
        try {
          const result = await store.invoiceService.createPaymentConfirmation(invoice.okey);
          saveBase64Pdf(result.content, `Zahlungsbestaetigung-${invoice.invoiceId || invoice.okey}.pdf`);
        } catch (e) {
          console.error('InvoiceStore.createPaymentConfirmation: createPaymentConfirmation failed', e);
          await showToast(store.toastController,
            invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.payment_confirmation_error(), 'confirmation'));
        }
        return;
      }
      await this.createLegacyPaymentConfirmation(invoice);
    },

    /**
     * Render the payment confirmation (templates/PAYMENT_CONFIRMATION_TEMPLATE_ID) for a paid
     * invoice of books kept in bexio and save it as PDF. The payload is built from the invoice, its
     * receiver and the receiver's favorite postal address; the payee is resolved by the Cloud Function.
     */
    async createLegacyPaymentConfirmation(invoice: InvoiceModel): Promise<void> {
      const receiver = invoice.receiver;
      if (!receiver || !canCreatePaymentConfirmation(invoice)) return;
      try {
        let party: ReceiptParty | undefined;
        if (receiver.modelType === 'person') {
          const person = await firstValueFrom(store.personService.read(receiver.key).pipe(take(1)));
          if (person) party = { kind: 'person', person };
        } else if (receiver.modelType === 'org') {
          const org = await firstValueFrom(store.orgService.read(receiver.key).pipe(take(1)));
          if (org) party = { kind: 'org', org };
        }
        if (!party) {
          await showToast(store.toastController, store.i18n.payment_confirmation_error());
          return;
        }
        // addresses.parentKey is modelType-prefixed ('person.<okey>' / 'org.<okey>').
        // Only the owner, privileged and memberAdmin read the raw vault; a treasurer gets the
        // member-visible postal address from the address-directory projection instead.
        const parentKey = `${party.kind === 'person' ? PersonModelName : OrgModelName}.${receiver.key}`;
        const address = readsAddressVault(store.appStore.currentUser(), parentKey)
          ? await firstValueFrom(store.addressService.getFavoritePostalAddress(parentKey).pipe(take(1)))
          : getDirectoryPostalAddress(store.appStore.getDirectoryEntry(parentKey)?.entries, store.appStore.tenantId(), parentKey);
        if (!address) {
          await showToast(store.toastController, store.i18n.payment_confirmation_noAddress());
          return;
        }

        const filename = `Zahlungsbestaetigung-${invoice.invoiceId || invoice.okey}.pdf`;
        const result = await store.docGenerationService.generate({
          templateId: PAYMENT_CONFIRMATION_TEMPLATE_ID,
          payload: buildPaymentConfirmationPayload(invoice, party, address),
          options: {
            outputFormat: 'pdf',
            storageMode: 'persist',
            filename,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            metadata: { entityType: 'invoice', entityId: invoice.okey },
          },
        });
        // Fetch into a blob download: window.open this long after the action sheet closed is
        // no longer a user gesture and the browser blocks the tab silently.
        const saved = await downloadFromUrl(result.url, filename);
        if (!saved) window.open(result.url, '_blank');
      } catch (e) {
        console.error('InvoiceStore.createPaymentConfirmation: failed to generate the PDF', e);
        await showToast(store.toastController, store.i18n.payment_confirmation_error());
      }
    },
  })),
);

export type InvoiceStore = InstanceType<typeof InvoiceStore>;
