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
import { I18nService } from '@okr/shared-i18n';
import { AccountModel, BillCollection, BillModel } from '@okr/shared-models';
import { confirm, exportCsv, resourceParams, showToast } from '@okr/shared-util-angular';
import { debugListLoaded, fill, getSystemQuery, getTodayStr, getYear, nameMatches } from '@okr/shared-util-core';

import { BillService } from '@okr/finance-bill-data-access';
import { BillPaymentModal } from '@okr/finance-bill-ui';
import {
  BILL_I18N_KEYS, BillI18n, BillPaymentCandidate, BillPaymentInput, billDisplayState, billPaymentHintWindow, billPaymentHints, billPaymentWindow, billRefusalReasons, billRefusalText,
  getBillExportData, isDraftBill, isPayableBill, isRetryableBillPaymentRefusal, linkedBillPaymentKeys, newBill, newBillLine,
  newBillPaymentFormModel, openBillAmount, vendorByName,
} from '@okr/finance-bill-util';
import { newPaymentId } from '@okr/finance-invoice-util';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';

import { BillEditModal, BillEditResult } from './bill-edit.modal';
import { BillQrScanModal } from './bill-qr-scan.modal';

export type { BillI18n };

/** Shape returned by the parseQrInvoice cloud function (via BillQrScanModal). */
interface ParsedQrInvoice {
  iban: string;
  amount: number;      // in cents
  currency: string;
  reference: string;
  creditorName: string;
  dueDate: string;     // store date (yyyymmdd)
}

export type BillState = {
  listId: string;         // 'all' | 'my' | vendorKey
  searchTerm: string;
  selectedState: string;  // 'all' | 'draft' | 'todo' | 'paid' | 'overdue'
  selectedYear: number;   // all is 99
  version: number;
};

const initialState: BillState = {
  listId: 'all',
  searchTerm: '',
  selectedState: 'all',
  selectedYear: getYear(),
  version: 0,
};

export const BillStore = signalStore(
  withState(initialState),
  withProps((store) => {
    const appStore = inject(AppStore);
    const functions = getFunctions(getApp(), 'europe-west6');
    if (appStore.env.useEmulators) {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return {
      billService: inject(BillService),
      appStore,
      accountingStore: inject(AccountingStore),
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      alertController: inject(AlertController),
      toastController: inject(ToastController),
      accountService: inject(AccountService),
      functions,
      i18nService: inject(I18nService),
    };
  }),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BILL_I18N_KEYS),
  })),

  withProps((store) => ({
    allBillsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        accountingTenantId: store.accountingStore.accountingTenantId(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser || !params.accountingTenantId) return of([]);
        return store.firestoreService.searchData<BillModel>(
          BillCollection,
          [
            ...getSystemQuery(store.appStore.tenantId()),
            { key: 'accountingTenantId', operator: '==' as const, value: params.accountingTenantId },
          ],
          'billDate',
          'desc'
        ).pipe(debugListLoaded('BillStore.allBills', params.currentUser));
      },
    }),
  })),

  withComputed((store) => ({
    /** the account a new bill line starts on (the books' default expense account; '' when not configured) */
    defaultExpenseAccountKey: computed(() => store.accountingStore.config()?.defaultExpenseAccountKey ?? ''),
    /** the payables account of the books (spec 1.85); '' = not configured (legacy config docs lack it) */
    payablesAccountKey: computed(() => store.accountingStore.config()?.payablesAccountKey ?? ''),
    /** the open bills of the books — the ones a payment can be recorded on */
    openBills: computed(() => (store.allBillsResource.value() ?? []).filter((b) => isPayableBill(b) && openBillAmount(b) > 0)),
    /** every payment booking already linked on a bill of these books */
    linkedPaymentKeys: computed(() => linkedBillPaymentKeys(store.allBillsResource.value() ?? [])),
  })),

  /**
   * Payment hints (spec 1.85 Q4): the posted bookings that debit the payables account with exactly the
   * open amount of an open bill. Read once per list load, only while an open bill exists and the books
   * name a payables account; a failed read just shows no hints.
   */
  withProps((store) => ({
    // resourceParams: value-compared, so a bill stream emission that changes nothing relevant does not re-read
    paymentCandidatesResource: rxResource({
      params: resourceParams(() => {
        const window = billPaymentHintWindow(store.openBills(), getTodayStr());
        return {
          accountingTenantId: store.accountingStore.accountingTenantId(),
          payablesAccountKey: store.payablesAccountKey(),
          fromDate: window?.from ?? '',
          toDate: window?.to ?? '',
          linkedKeys: store.linkedPaymentKeys().join(','),
          external: store.accountingStore.isExternallyManaged(),
        };
      }),
      stream: ({ params }) => {
        if (!params.payablesAccountKey || !params.fromDate || params.external) return of([] as BillPaymentCandidate[]);
        return from(store.billService.listPaymentCandidates(params.accountingTenantId, params.payablesAccountKey,
          params.linkedKeys ? params.linkedKeys.split(',') : [], params.fromDate, params.toDate, 2000)
          .catch((e) => {
            console.error('BillStore.paymentCandidates: loading the bookings failed', e);
            return [] as BillPaymentCandidate[];
          }));
      },
    }),
  })),

  withComputed((store) => ({
    /** billKey → candidate booking of the likely payment */
    paymentHints: computed(() => {
      const candidates = store.paymentCandidatesResource.value() ?? [];
      const byKey = new Map(candidates.map((c) => [c.bookingKey, c]));
      const hints = new Map<string, BillPaymentCandidate>();
      const window = billPaymentHintWindow(store.openBills(), getTodayStr());
      for (const [billKey, bookingKey] of billPaymentHints(window?.bills ?? [], candidates)) {
        const candidate = byKey.get(bookingKey);
        if (candidate) hints.set(billKey, candidate);
      }
      return hints;
    }),
    isLoading: computed(() => store.allBillsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isExternallyManaged: computed(() => store.accountingStore.isExternallyManaged()),
    states: computed(() => store.appStore.getCategory('bill_state')),

    filteredBills: computed(() => {
      const listId = store.listId();
      const searchTerm = store.searchTerm().toLowerCase();
      const currentUser = store.appStore.currentUser();

      let bills = store.allBillsResource.value() ?? [];

      if (listId === 'my') {
        const personKey = currentUser?.personKey;
        bills = personKey ? bills.filter(b => b.vendor?.key === personKey) : [];
      } else if (listId !== 'all') {
        bills = bills.filter(b => b.vendor?.key === listId);
      }

      // filter by state
      const selectedState = store.selectedState();
      if (selectedState !== 'all') {
        // 'overdue' is also computed (to pay and past due), so filter on the state the list shows
        const today = getTodayStr();
        bills = bills.filter(b => billDisplayState(b, today) === selectedState);
      }

      // filter by year
      const selectedYear = store.selectedYear();
      if (selectedYear !== 99) {
        bills = bills.filter(b => b.billDate.startsWith(selectedYear + ''));
      }

      if (searchTerm) {
        bills = bills.filter(b => nameMatches(b.index, searchTerm));
      }

      return bills;
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

    /******************************** actions ******************************************* */
    async add(): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      const bill = newBill(store.appStore.tenantId());
      bill.accountingTenantId = store.accountingStore.accountingTenantId();
      bill.billDate = getTodayStr();
      bill.lines = [newBillLine(store.defaultExpenseAccountKey())];
      await this.openEdit(bill, true);
    },

    /** A new draft from a scanned QR-bill: reference, IBAN, due date, vendor (by name) and one line with the amount. */
    async scan(): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      const scanModal = await store.modalController.create({ component: BillQrScanModal });
      await scanModal.present();
      const { data: parsed, role } = await scanModal.onWillDismiss<ParsedQrInvoice>();
      if (role !== 'confirm' || !parsed) return;
      const bill = newBill(store.appStore.tenantId());
      bill.accountingTenantId = store.accountingStore.accountingTenantId();
      bill.billDate = getTodayStr();
      bill.title = parsed.creditorName ?? '';
      bill.dueDate = parsed.dueDate ?? '';
      bill.paymentReference = parsed.reference ?? '';
      bill.creditorIban = parsed.iban ?? '';
      bill.vendor = vendorByName(store.appStore.allOrgs(), parsed.creditorName ?? '');
      bill.lines = [newBillLine(store.defaultExpenseAccountKey(), parsed.amount ?? 0, parsed.creditorName ?? '')];
      await this.openEdit(bill, true);
    },

    async edit(bill: BillModel): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      await this.openEdit({ ...bill }, false);
    },

    /** Opens the edit modal and writes the result through `writeBill` (drafts only; anything else opens read-only). */
    async openEdit(bill: BillModel, isNew: boolean): Promise<void> {
      const modal = await store.modalController.create({
        component: BillEditModal,
        componentProps: {
          bill,
          currentUser: store.appStore.currentUser(),
          isNew,
          readOnly: false,
          defaultAccountKey: store.defaultExpenseAccountKey(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<BillEditResult>();
      if (role !== 'confirm' || !data) return;
      try {
        await store.billService.write(isNew ? 'create' : 'update', data.bill, data.lines, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.save_conf());
      } catch (e) {
        console.error('BillStore.openEdit: writeBill failed', e);
        await showToast(store.toastController, billRefusalText(billRefusalReasons(e), store.i18n, store.i18n.save_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /** «Verbuchen»: books a draft as `bill-{key}` (expense lines / payables) after a confirmation. */
    async book(bill: BillModel): Promise<void> {
      if (!isDraftBill(bill) || store.accountingStore.isExternallyManaged()) return;
      const confirmed = await confirm(store.alertController, store.i18n.book_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        await store.billService.book(bill.okey, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.book_conf());
      } catch (e) {
        console.error('BillStore.book: bookBill failed', e);
        await showToast(store.toastController, billRefusalText(billRefusalReasons(e), store.i18n, store.i18n.book_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    /**
     * Records an outgoing payment on an open bill (spec 1.85): opens the payment dialog, then calls
     * `recordBillPayment`. One `paymentId` per dialog: when the call fails with a reason the treasurer
     * can fix (or no reason at all — a network error), the dialog opens again with the entered values
     * and the same id, so a payment that did reach the server is not booked twice.
     * @param preselect the hinted booking (Q4): the dialog opens in mode link with it selected
     */
    async recordPayment(bill: BillModel, preselect?: BillPaymentCandidate): Promise<boolean> {
      if (!isPayableBill(bill) || store.accountingStore.isExternallyManaged()) return false;
      const config = store.accountingStore.config();
      const payablesAccountKey = config?.payablesAccountKey ?? '';
      if (!config || !payablesAccountKey) {
        await showToast(store.toastController, store.i18n.payment_not_configured());
        return false;
      }
      // legacy config docs lack the field (Firestore reads skip model defaults)
      const paymentAccountKeys = config.billPaymentAccountKeys ?? [];
      let accounts: AccountModel[] = [];
      try {
        accounts = paymentAccountKeys.length > 0
          ? await firstValueFrom(store.accountService.list(bill.accountingTenantId).pipe(take(1)))
          : [];
      } catch (e) {
        console.error('BillStore.recordPayment: loading the accounts failed', e);
        await showToast(store.toastController, store.i18n.payment_error());
        return false;
      }
      // The link candidates are read only when the dialog shows mode link, once per dialog; a failed
      // read is forgotten so that a reopened dialog tries again.
      const window = billPaymentWindow(bill, getTodayStr());
      let candidatesRead: Promise<BillPaymentCandidate[]> | undefined;
      const loadCandidates = (): Promise<BillPaymentCandidate[]> =>
        candidatesRead ??= store.billService.listPaymentCandidates(bill.accountingTenantId, payablesAccountKey,
          store.linkedPaymentKeys(), window?.from ?? '', window?.to ?? '').catch((e) => {
          candidatesRead = undefined;
          throw e;
        });
      const paymentAccounts = accounts.filter((a) => paymentAccountKeys.includes(a.okey));
      const paymentId = newPaymentId();
      let payment = newBillPaymentFormModel(bill, getTodayStr(), paymentAccounts.map((a) => a.okey), preselect);

      for (;;) {
        const modal = await store.modalController.create({
          component: BillPaymentModal,
          componentProps: { payment, accounts: paymentAccounts, loadCandidates },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<BillPaymentInput>();
        if (role !== 'confirm' || !data) return false;
        try {
          const result = await store.billService.recordPayment(bill.okey, data, paymentId, store.appStore.currentUser() ?? undefined);
          // derived from the callable's answer: a re-read right after the write may still be the old snapshot
          const open = openBillAmount({ totalAmount: bill.totalAmount, payments: result.payments });
          await showToast(store.toastController, result.state === 'paid'
            ? store.i18n.payment_conf_paid()
            : fill(store.i18n.payment_conf(), { open: (open / 100).toFixed(2) }));
          patchState(store, { version: store.version() + 1 });
          return true;
        } catch (e) {
          console.error('BillStore.recordPayment: recordBillPayment failed', e);
          const reasons = billRefusalReasons(e);
          await showToast(store.toastController, billRefusalText(reasons, store.i18n, store.i18n.payment_error()));
          if (!isRetryableBillPaymentRefusal(reasons)) {
            patchState(store, { version: store.version() + 1 });
            return false;
          }
          const candidates = data.mode === 'link' ? await loadCandidates().catch(() => [] as BillPaymentCandidate[]) : [];
          const candidate = candidates.find((c) => c.bookingKey === data.bookingKey);
          payment = {
            ...payment, mode: data.mode, date: data.date, amount: data.amount,
            bankAccountKey: data.bankAccountKey || payment.bankAccountKey, bookingKey: data.bookingKey,
            // a booking the dialog's read does not list (e.g. the hint) keeps the amount it was opened with
            bookingAmount: candidate ? candidate.debitedAmount / 100 : (data.bookingKey === payment.bookingKey ? payment.bookingAmount : 0),
          };
        }
      }
    },

    /** Removes a linked payment after a confirmation; the booking stays in the journal (spec 1.85 B8). */
    async unlinkPayment(bill: BillModel, bookingKey: string): Promise<boolean> {
      if (store.accountingStore.isExternallyManaged()) return false;
      const confirmed = await confirm(store.alertController, store.i18n.unlink_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return false;
      try {
        await store.billService.unlinkPayment(bill.okey, bookingKey, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.unlink_conf());
        patchState(store, { version: store.version() + 1 });
        return true;
      } catch (e) {
        console.error('BillStore.unlinkPayment: unlinkBillPayment failed', e);
        await showToast(store.toastController, billRefusalText(billRefusalReasons(e), store.i18n, store.i18n.unlink_error()));
        return false;
      }
    },

    /** Deletes a draft bill (a booked one: its booking is deleted in the journal first, which returns it to draft). */
    async delete(bill: BillModel): Promise<void> {
      if (!isDraftBill(bill) || store.accountingStore.isExternallyManaged()) return;
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      try {
        await store.billService.delete(bill, store.appStore.currentUser() ?? undefined);
        await showToast(store.toastController, store.i18n.delete_conf());
      } catch (e) {
        console.error('BillStore.delete: writeBill failed', e);
        await showToast(store.toastController, billRefusalText(billRefusalReasons(e), store.i18n, store.i18n.delete_error()));
      }
      patchState(store, { version: store.version() + 1 });
    },

    async export(type: string, bills: BillModel[]): Promise<void> {
      if (type === 'raw') {
        await exportCsv(getBillExportData(bills), 'bills.xlsx', 'Bills');
      }
    },

    async view(bill: BillModel): Promise<void> {
      const { BillViewModal } = await import('./bill-view.modal');
      const modal = await store.modalController.create({
        component: BillViewModal,
        componentProps: { bill: { ...bill } },
      });
      await modal.present();
    },

    async showPdf(bill: BillModel): Promise<void> {
      const attachmentId = bill.attachments[0];
      if (!attachmentId) return;
      const fn = httpsCallable<{ attachmentId: string }, { content: string; mimeType?: string }>(
        store.functions, 'showBillPdf'
      );
      const result = await fn({ attachmentId });
      const bytes = Uint8Array.from(atob(result.data.content), c => c.charCodeAt(0));
      const mimeType = result.data.mimeType ?? 'application/pdf';
      const blob = new Blob([bytes], { type: mimeType });
      const extension = ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' } as Record<string, string>)[mimeType] ?? 'pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bill.billId}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    },
  })),
);

export type BillStore = InstanceType<typeof BillStore>;
