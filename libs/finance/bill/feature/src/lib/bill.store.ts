import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { BillCollection, BillModel } from '@bk2/shared-models';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';

import { BillService } from '@bk2/finance-bill-data-access';

import { BillViewModal } from './bill-view.modal';

export type BillState = {
  listId: string;    // 'all' | 'my' | vendorKey
  searchTerm: string;
  version: number;
};

const initialState: BillState = {
  listId: 'all',
  searchTerm: '',
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
      firestoreService: inject(FirestoreService),
      modalController: inject(ModalController),
      functions,
    };
  }),

  withProps((store) => ({
    allBillsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.firestoreService.searchData<BillModel>(
          BillCollection,
          getSystemQuery(store.appStore.tenantId()),
          'billDate',
          'desc'
        ).pipe(debugListLoaded('BillStore.allBills', params.currentUser));
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allBillsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),

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

      if (searchTerm) {
        bills = bills.filter(b => nameMatches(b.index, searchTerm));
      }

      return bills;
    }),
  })),

  withMethods((store) => ({
    setListId(listId: string): void {
      patchState(store, { listId });
    },
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    async view(bill: BillModel): Promise<void> {
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
