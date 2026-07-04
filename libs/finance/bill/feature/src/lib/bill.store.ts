import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BillCollection, BillModel } from '@okr/shared-models';
import { confirm, exportCsv } from '@okr/shared-util-angular';
import { debugListLoaded, getSystemQuery, getYear, nameMatches } from '@okr/shared-util-core';

import { BillService } from '@okr/finance-bill-data-access';
import { BILL_I18N_KEYS, BillI18n, getBillExportData, newBill } from '@okr/finance-bill-util';
import { AccountingStore } from '@okr/finance-accounting-feature';

import { BillEditModal } from './bill-edit.modal';
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
        bills = bills.filter(b => b.state === selectedState);
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
      await this.openEdit(bill, true);
    },

    async scan(): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      const scanModal = await store.modalController.create({ component: BillQrScanModal });
      await scanModal.present();
      const { data: parsed, role } = await scanModal.onWillDismiss<ParsedQrInvoice>();
      if (role !== 'confirm' || !parsed) return;
      const bill = newBill(store.appStore.tenantId());
      bill.accountingTenantId = store.accountingStore.accountingTenantId();
      bill.billId = parsed.reference ?? '';
      bill.title = parsed.creditorName ?? '';
      bill.dueDate = parsed.dueDate ?? '';
      bill.state = 'todo';
      bill.totalAmount = { amount: parsed.amount ?? 0, currency: parsed.currency ?? 'CHF', periodicity: 'one-time' };
      await this.openEdit(bill, true);
    },

    async edit(bill: BillModel): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      await this.openEdit({ ...bill }, false);
    },

    async openEdit(bill: BillModel, isNew: boolean): Promise<void> {
      const modal = await store.modalController.create({
        component: BillEditModal,
        componentProps: {
          bill,
          currentUser: store.appStore.currentUser(),
          isNew,
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<BillModel>();
      if (role === 'confirm' && data) {
        if (isNew) {
          await store.billService.create(data, store.appStore.currentUser() ?? undefined);
        } else {
          await store.billService.update(data, store.appStore.currentUser() ?? undefined);
        }
        patchState(store, { version: store.version() + 1 });
      }
    },

    async delete(bill: BillModel): Promise<void> {
      if (store.accountingStore.isExternallyManaged()) return;
      const confirmed = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
      if (!confirmed) return;
      await store.billService.delete(bill, store.appStore.currentUser() ?? undefined);
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
      const fn = httpsCallable<{ attachmentId: string }, { content: string }>(
        store.functions, 'showBillPdf'
      );
      const result = await fn({ attachmentId });
      const bytes = Uint8Array.from(atob(result.data.content), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bill.billId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  })),
);

export type BillStore = InstanceType<typeof BillStore>;
