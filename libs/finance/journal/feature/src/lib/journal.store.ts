import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { map, of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { BookingJournalModel, JournalCollection } from '@bk2/shared-models';
import { debugListLoaded, getYear, nameMatches } from '@bk2/shared-util-core';

import { JournalViewModal } from './journal-view.modal';

export type JournalState = {
  searchTerm: string;
  selectedYear: number;
};

const initialState: JournalState = {
  searchTerm: '',
  selectedYear: getYear(),
};

export const JournalStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
  })),

  withProps((store) => ({
    journalResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        tenantId: store.appStore.tenantId(),
        selectedYear: store.selectedYear(),
      }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([]);
        const { selectedYear, tenantId } = params;
        // Use only a single-field date range — avoids requiring a composite Firestore index.
        // tenants + isArchived are filtered in-memory on the small per-year result set.
        const yearStr = String(selectedYear);
        const nextYearStr = String(selectedYear + 1);
        const query = [
          { key: 'date', operator: '>=', value: yearStr },
          { key: 'date', operator: '<',  value: nextYearStr },
        ];
        return store.firestoreService.searchData<BookingJournalModel>(
          JournalCollection,
          query,
          'date',
          'desc'
        ).pipe(
          map(entries => entries.filter(e => !e.isArchived && e.tenants?.includes(tenantId))),
          debugListLoaded('JournalStore.journal', params.currentUser)
        );
      },
    }),
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.journalResource.isLoading()),

    filteredJournal: computed(() => {
      const searchTerm = store.searchTerm().toLowerCase();
      let entries = store.journalResource.value() ?? [];
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
