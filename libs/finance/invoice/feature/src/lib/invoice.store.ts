import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { InvoiceCollection, InvoiceModel } from '@bk2/shared-models';
import { confirm, exportXlsx } from '@bk2/shared-util-angular';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';

import { InvoiceService } from '@bk2/finance-invoice-data-access';
import { getInvoiceExportData, newInvoice } from '@bk2/finance-invoice-util';

import { InvoiceEditModal } from './invoice-edit.modal';
import { InvoiceViewModal } from 'libs/finance/invoice/feature/src/lib/invoice-view.modal';

export type InvoiceState = {
  listId: string;         // 'all' | 'my' | personKey
  searchTerm: string;
  selectedState: string;  // 'all' | 'draft' | 'pending' | 'paid' | 'cancelled'
  version: number;
};

const initialState: InvoiceState = {
  listId: 'all',
  searchTerm: '',
  selectedState: 'all',
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
      appStore,
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      toastController: inject(ToastController),
      alertController: inject(AlertController),
      functions,
    };
  }),

  withProps((store) => ({
    allInvoicesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.firestoreService.searchData<InvoiceModel>(
          InvoiceCollection,
          getSystemQuery(store.appStore.tenantId()),
          'invoiceDate',
          'desc'
        ).pipe(debugListLoaded('InvoiceStore.allInvoices', params.currentUser));
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allInvoicesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),

    filteredInvoices: computed(() => {
      const listId = store.listId();
      const searchTerm = store.searchTerm().toLowerCase();
      const selectedState = store.selectedState();
      const currentUser = store.appStore.currentUser();

      let invoices = store.allInvoicesResource.value() ?? [];

      // filter by listId
      if (listId === 'my') {
        const personKey = currentUser?.personKey;
        invoices = personKey ? invoices.filter(i => i.receiver?.key === personKey) : [];
      } else if (listId !== 'all') {
        invoices = invoices.filter(i => i.receiver?.key === listId);
      }

      // filter by state
      if (selectedState !== 'all') {
        invoices = invoices.filter(i => i.state === selectedState);
      }

      // filter by search term
      if (searchTerm) {
        invoices = invoices.filter(i => nameMatches(i.index, searchTerm));
      }

      return invoices;
    }),
  })),

  withMethods((store) => ({
    setListId(listId: string): void {
      patchState(store, { listId });
    },
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },
    setSelectedState(selectedState: string): void {
      patchState(store, { selectedState });
    },

    async add(): Promise<void> {
      const invoice = newInvoice(store.appStore.tenantId());
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
      const { data, role } = await modal.onWillDismiss<InvoiceModel>();
      if (role === 'confirm' && data) {
        await store.invoiceService.create(data, store.appStore.currentUser() ?? undefined);
        patchState(store, { version: store.version() + 1 });
      }
    },

    async edit(invoice: InvoiceModel, readOnly = false): Promise<void> {
      const modal = await store.modalController.create({
        component: InvoiceEditModal,
        componentProps: {
          invoice: { ...invoice },
          currentUser: store.appStore.currentUser(),
          isNew: false,
          readOnly,
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<InvoiceModel>();
      if (role === 'confirm' && data) {
        await store.invoiceService.update(data, store.appStore.currentUser() ?? undefined);
        patchState(store, { version: store.version() + 1 });
      }
    },

    async view(invoice: InvoiceModel): Promise<void> {
      const modal = await store.modalController.create({
        component: InvoiceViewModal,
        componentProps: {
          invoice: { ...invoice }
        },
      });
      await modal.present();
    },

    async delete(invoice: InvoiceModel): Promise<void> {
      const confirmed = await confirm(store.alertController, '@invoice.operation.delete.confirm', true);
      if (!confirmed) return;
      await store.invoiceService.delete(invoice, store.appStore.currentUser() ?? undefined);
      patchState(store, { version: store.version() + 1 });
    },

    async export(type: string, invoices: InvoiceModel[]): Promise<void> {
      if (type === 'raw') {
        await exportXlsx(getInvoiceExportData(invoices), 'invoices.xlsx', 'Invoices');
      }
    },

    async showPdf(invoice: InvoiceModel): Promise<void> {
      const fn = httpsCallable<{ invoiceId: string }, { content: string }>(
        store.functions, 'showInvoicePdf'
      );
      const result = await fn({ invoiceId: invoice.bkey });
      const bytes = Uint8Array.from(atob(result.data.content), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  })),
);

export type InvoiceStore = InstanceType<typeof InvoiceStore>;
