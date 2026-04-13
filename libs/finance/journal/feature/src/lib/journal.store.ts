import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { BookingJournalModel, JournalCollection } from '@bk2/shared-models';
import { debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';

import { JournalViewModal } from './journal-view.modal';

export type JournalState = {
  searchTerm: string;
  selectedYear: number;
};

const initialState: JournalState = {
  searchTerm: '',
  selectedYear: 0, // 0 = all years
};

export const JournalStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
  })),

  withProps((store) => ({
    allJournalResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        return store.firestoreService.searchData<BookingJournalModel>(
          JournalCollection,
          getSystemQuery(store.appStore.tenantId()),
          'date',
          'desc'
        ).pipe(debugListLoaded('JournalStore.allJournal', params.currentUser));
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.allJournalResource.isLoading()),

    filteredJournal: computed(() => {
      const searchTerm = store.searchTerm().toLowerCase();
      const selectedYear = store.selectedYear();

      let entries = store.allJournalResource.value() ?? [];

      if (selectedYear > 0) {
        const yearPrefix = String(selectedYear);
        entries = entries.filter(e => e.date.startsWith(yearPrefix));
      }

      if (searchTerm) {
        entries = entries.filter(e => nameMatches(e.index || e.title, searchTerm));
      }

      return entries;
    }),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },
    setSelectedYear(selectedYear: number): void {
      patchState(store, { selectedYear });
    },

    async view(entry: BookingJournalModel): Promise<void> {
      const modal = await store.modalController.create({
        component: JournalViewModal,
        componentProps: { entry: { ...entry } },
      });
      await modal.present();
    },
  })),
);

export type JournalStore = InstanceType<typeof JournalStore>;
