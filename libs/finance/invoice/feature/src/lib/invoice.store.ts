import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { AccountModel, DEFAULT_REMINDER_GRACE_DAYS, InvoiceCollection, InvoiceModel, OrgModelName, PersonModelName } from '@okr/shared-models';
import { confirm, exportCsv, showToast } from '@okr/shared-util-angular';
import {
  convertDateFormatToString, DateFormat, debugListLoaded, fill, getSystemQuery, getTodayStr, getYear, hasRole, nameMatches,
} from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { InvoiceService } from '@okr/finance-invoice-data-access';
import { InvoicePaymentModal } from '@okr/finance-invoice-ui';
import {
  buildPaymentConfirmationPayload, canCreatePaymentConfirmation, canCreateReminder, canEmailInvoice, cancelInputProblem, isPayableState, defaultReminderFee,
  draftInvoicesOf, formatPaymentChf, getInvoiceExportData, INVOICE_CANCEL_REASON_LENGTH, INVOICE_I18N_KEYS, InvoiceI18n, InvoicePaymentCandidate,
  InvoicePaymentInput, invoiceRefusalReasons, invoiceRefusalText, invoicesForList, isDraftInvoice, isRetryablePaymentRefusal, latestReminderWithDocument,
  mahnlaufCandidates, newDraftInvoice, newInvoicePaymentFormModel, newPaymentId, nextReminderLevel, openInvoiceAmount, parseReminderFee,
  PAYMENT_CONFIRMATION_TEMPLATE_ID, reminderInputProblem, reminderLevelKey, waivableReminder, waiveInputProblem, WAIVE_REASON_MAX,
} from '@okr/finance-invoice-util';
import { FinanceDocumentService } from '@okr/finance-accounting-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReceiptParty } from '@okr/finance-booking-util';
import { downloadFromUrl } from '@okr/finance-reporting-util';
import { DocGenerationService } from '@okr/content-pdf-template-data-access';
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
      financeDocumentService: inject(FinanceDocumentService),
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
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allInvoicesResource.isLoading()),
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
        invoices = invoices.filter(i => i.state === selectedState);
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
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.issue_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Records a received payment on an issued invoice (spec 1.76 phase 2): opens the payment dialog,
     * then calls `recordInvoicePayment`. One `paymentId` per dialog: when the call fails with a reason
     * the treasurer can fix (or no reason at all — a network error), the dialog opens again with the
     * entered values and the same id, so a payment that did reach the server is not booked twice.
     */
    async recordPayment(invoice: InvoiceModel): Promise<void> {
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
      let payment = newInvoicePaymentFormModel(invoice, getTodayStr(), paymentAccounts.map((a) => a.okey));

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
            bookingAmount: (candidate?.creditedAmount ?? 0) / 100,
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
      const levelLabel = store.i18n[reminderLevelKey(reminder.level)]();
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

    /** "2. Mahnung zu Rechnung 202600001" — how a confirm alert or toast names a reminder PDF. */
    reminderDocumentLabel(invoice: InvoiceModel, level: number): string {
      return fill(store.i18n.document_reminder(), { level: store.i18n[reminderLevelKey(level)](), invoiceId: invoice.invoiceId || invoice.okey });
    },

    /**
     * Creates the next reminder of an open invoice (spec 1.76 phase 3): asks for the date (today by
     * default) and the fee in CHF (the configured fee of the level by default), then `createInvoiceReminder`
     * renders the PDF and books the fee. The toast names the open amount from the callable's answer; then
     * the reminder can be mailed right away.
     */
    async createReminder(invoice: InvoiceModel): Promise<void> {
      if (!canCreateReminder(invoice) || store.accountingStore.isExternallyManaged() !== false) return;
      const config = store.accountingStore.config();
      if (!config) {
        await showToast(store.toastController, store.i18n.refusal_no_accounting_config());
        return;
      }
      const level = nextReminderLevel(invoice.reminders);
      const levelLabel = store.i18n[reminderLevelKey(level)]();
      // legacy config docs lack the field (Firestore reads skip model defaults): defaultReminderFee then
      // uses the model default DEFAULT_REMINDER_FEES, exactly like the server (ruling P3-R2)
      const defaultFee = formatPaymentChf(defaultReminderFee(config.reminderFees, level));
      const message = store.i18n.reminder_create_message();
      let input: { date: string; fee: number } | undefined;
      const alert = await store.alertController.create({
        header: levelLabel,
        message,
        inputs: [
          { name: 'date', type: 'date', value: getTodayStr(DateFormat.IsoDate), attributes: { 'aria-label': store.i18n.reminder_date() } },
          { name: 'fee', type: 'text', value: defaultFee, placeholder: store.i18n.reminder_fee(),
            attributes: { inputmode: 'decimal', 'aria-label': store.i18n.reminder_fee() } },
        ],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          {
            text: store.i18n.reminder_create_ok(),
            role: 'confirm',
            handler: (values: { date?: string; fee?: string }) => {
              const date = values?.date ? (convertDateFormatToString(values.date, DateFormat.IsoDate, DateFormat.StoreDate, false) || '') : '';
              const problem = reminderInputProblem(date, values?.fee);
              if (problem) {
                // keep the alert open and say what is missing
                alert.message = `${message} ${problem === 'date' ? store.i18n.reminder_date_invalid() : store.i18n.reminder_fee_invalid()}`;
                return false;
              }
              input = { date, fee: parseReminderFee(values?.fee) ?? 0 };
              return true;
            },
          },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !input) return;

      let documentKey = '';
      try {
        const result = await store.invoiceService.createReminder(invoice.okey, level, input.date, input.fee, store.appStore.currentUser() ?? undefined);
        documentKey = result.reminder?.documentKey ?? '';
        // derived from the callable's answer: a re-read right after the write may still be the old snapshot
        await showToast(store.toastController, fill(store.i18n.reminder_conf(), {
          document: levelLabel, date: viewDate(result.reminder?.date ?? input.date), open: formatPaymentChf(result.openAmount),
        }));
      } catch (e) {
        console.error('InvoiceStore.createReminder: createInvoiceReminder failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.reminder_error(), 'reminder'));
        patchState(store, { version: store.version() + 1 });
        return;
      }
      patchState(store, { version: store.version() + 1 });
      if (!documentKey) return;
      const label = this.reminderDocumentLabel(invoice, level);
      const sendNow = await confirm(store.alertController, fill(store.i18n.reminder_send_now(), { document: label }),
        store.i18n.email_ok(), store.i18n.reminder_later(), true);
      if (sendNow) await this.sendDocument(invoice, documentKey, label, false);
    },

    /** Mails the invoice PDF to the receiver (spec 1.76 D12) after a confirmation naming the invoice. */
    async sendInvoiceEmail(invoice: InvoiceModel): Promise<void> {
      if (!canEmailInvoice(invoice) || store.accountingStore.isExternallyManaged() !== false) return;
      await this.sendDocument(invoice, invoice.documentKey, this.invoiceDocumentLabel(invoice));
    },

    /** Mails the latest reminder that has a PDF to the receiver, after a confirmation naming it. */
    async sendReminderEmail(invoice: InvoiceModel): Promise<void> {
      const reminder = latestReminderWithDocument(invoice.reminders);
      // a paid or cancelled invoice gets no reminder mail (the server refuses it too)
      if (!reminder || !isPayableState(invoice.state) || store.accountingStore.isExternallyManaged() !== false) return;
      await this.sendDocument(invoice, reminder.documentKey, this.reminderDocumentLabel(invoice, reminder.level));
    },

    /**
     * Sends one document of an invoice by email. The confirmation names the document, never an address:
     * the client does not know it (it stays on the server). A send is not idempotent, so a failure is
     * reported and not retried.
     */
    async sendDocument(invoice: InvoiceModel, documentKey: string, label: string, askFirst = true): Promise<void> {
      if (askFirst) {
        const confirmed = await confirm(store.alertController, fill(store.i18n.email_confirm(), { document: label }),
          store.i18n.email_ok(), store.i18n.cancel(), true);
        if (!confirmed) return;
      }
      try {
        const result = await store.invoiceService.sendEmail(invoice.okey, documentKey, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, fill(store.i18n.email_conf(), { document: label, date: viewDate(result.sentAt) }));
      } catch (e) {
        console.error('InvoiceStore.sendDocument: sendInvoiceEmail failed', e);
        await showToast(store.toastController, invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_error(), 'email'));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Opens the latest reminder PDF: `signFinanceDocuments` (treasurer/privileged) hands out a short-lived
     * link to the private file, which is downloaded as a blob (a tab opened this long after the tap would
     * be blocked), else opened directly.
     */
    async showReminderPdf(invoice: InvoiceModel): Promise<void> {
      const reminder = latestReminderWithDocument(invoice.reminders);
      if (!reminder) return;
      try {
        const [voucher] = await store.financeDocumentService.sign([reminder.documentKey]);
        if (!voucher?.url) {
          await showToast(store.toastController, store.i18n.reminder_show_error());
          return;
        }
        const saved = await downloadFromUrl(voucher.url, `Mahnung-${reminder.level}-${invoice.invoiceId || invoice.okey}.pdf`);
        if (!saved) window.open(voucher.url, '_blank');
      } catch (e) {
        console.error('InvoiceStore.showReminderPdf: signFinanceDocuments failed', e);
        await showToast(store.toastController, store.i18n.reminder_show_error());
      }
    },

    /**
     * Mahnlauf (spec 1.76 phase 3): creates the next reminder of every due invoice of the list, one after
     * the other, each at its own next level with the configured fee, dated today; optionally mails each
     * one right after it was created. A refusal does not stop the run; a failed send does not undo the
     * reminder it belongs to and is listed on its own in the summary at the end.
     */
    async runMahnlauf(): Promise<void> {
      if (store.accountingStore.isExternallyManaged() !== false || !hasRole('treasurer', store.appStore.currentUser())) return;
      const candidates = store.mahnlaufInvoices();
      if (candidates.length === 0) return;
      const alert = await store.alertController.create({
        header: store.i18n.mahnlauf(),
        message: candidates.length === 1 ? store.i18n.mahnlauf_confirm_one() : fill(store.i18n.mahnlauf_confirm(), { count: candidates.length }),
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.mahnlauf_create(), role: 'create' },
          { text: store.i18n.mahnlauf_create_and_send(), role: 'send' },
        ],
      });
      await alert.present();
      const { role } = await alert.onDidDismiss();
      if (role !== 'create' && role !== 'send') return;
      const andSend = role === 'send';

      const today = getTodayStr();
      const currentUser = store.appStore.currentUser() ?? undefined;
      const progress = await store.toastController.create({ message: fill(store.i18n.mahnlauf_progress(), { n: 0, m: candidates.length }) });
      await progress.present();
      let created = 0;
      let sent = 0;
      const failures: string[] = [];
      const sendFailures: string[] = [];
      for (const [i, invoice] of candidates.entries()) {
        progress.message = fill(store.i18n.mahnlauf_progress(), { n: i + 1, m: candidates.length });
        const level = nextReminderLevel(invoice.reminders);
        let documentKey = '';
        try {
          // no fee: the server takes the configured fee of the level
          const result = await store.invoiceService.createReminder(invoice.okey, level, today, undefined, currentUser);
          created++;
          documentKey = result.reminder?.documentKey ?? '';
        } catch (e) {
          console.error(`InvoiceStore.runMahnlauf: createInvoiceReminder failed for ${invoice.okey}`, e);
          failures.push(`${invoiceLabel(invoice)}: ${invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.reminder_error(), 'reminder')}`);
          continue;
        }
        if (!andSend) continue;
        if (!documentKey) {
          sendFailures.push(`${invoiceLabel(invoice)}: ${store.i18n.refusal_no_document()}`);
          continue;
        }
        try {
          await store.invoiceService.sendEmail(invoice.okey, documentKey, currentUser);
          sent++;
        } catch (e) {
          console.error(`InvoiceStore.runMahnlauf: sendInvoiceEmail failed for ${invoice.okey}`, e);
          sendFailures.push(`${invoiceLabel(invoice)}: ${invoiceRefusalText(invoiceRefusalReasons(e), store.i18n, store.i18n.email_error(), 'email')}`);
        }
      }
      await progress.dismiss();
      patchState(store, { version: store.version() + 1 });

      const parts = [fill(store.i18n.mahnlauf_done(), { created, total: candidates.length })];
      if (andSend) parts.push(fill(store.i18n.mahnlauf_sent(), { sent }));
      if (failures.length > 0) parts.push(`${store.i18n.mahnlauf_failed()} ${failures.join(' · ')}`);
      if (sendFailures.length > 0) parts.push(`${store.i18n.mahnlauf_send_failed()} ${sendFailures.join(' · ')}`);
      await confirm(store.alertController, parts.join(' '), store.i18n.ok(), store.i18n.cancel(), false);
    },

    async export(type: string, invoices: InvoiceModel[]): Promise<void> {
      if (type === 'raw') {
        await exportCsv(getInvoiceExportData(invoices), 'invoices.xlsx', 'Invoices');
      }
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
