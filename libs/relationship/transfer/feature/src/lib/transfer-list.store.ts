import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { TransferCollection, TransferModel } from '@bk2/shared-models';
import { chipMatches, getSystemQuery, getYear, nameMatches } from '@bk2/shared-util-core';

import { TransferService } from '@bk2/relationship-transfer-data-access';

import { TransferModalsService } from './transfer-modals.service';

export type TransferListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedYear: number;
  selectedState: string;
};

export const initialTransferListState: TransferListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedYear: getYear(),
  selectedState: 'all',
};

export const TransferListStore = signalStore(
  withState(initialTransferListState),
  withProps(() => ({
    transferService: inject(TransferService),
    transferModalsService: inject(TransferModalsService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    transfersResource: rxResource({
      stream: () => {
        return store.firestoreService.searchData<TransferModel>(TransferCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
      }
    })
  })),

  withComputed((state) => {
    return {
      transfers: computed(() => state.transfersResource.value()),
      transfersCount: computed(() => state.transfersResource.value()?.length ?? 0), 
      currentUser: computed(() => state.appStore.currentUser()),
      currentPerson: computed(() => state.appStore.currentPerson()),
      defaultResource : computed(() => state.appStore.defaultResource()),
      filteredTransfers: computed(() => 
        state.transfersResource.value()?.filter((transfer: TransferModel) => 
          nameMatches(transfer.index, state.searchTerm()) &&
          yearMatches(transfer.dateOfTransfer, state.selectedYear() + '') &&
          nameMatches(transfer.type, state.selectedType()) &&
          nameMatches(transfer.state, state.selectedState()) &&
          chipMatches(transfer.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.transfersResource.isLoading()),
    };
  }),

  withMethods((store) => {
    return {

      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedType(selectedType: string) {
        patchState(store, { selectedType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('transfer');
      },

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        const _currentPerson = store.currentPerson();
        const _defaultResource = store.defaultResource();
        if (!_currentPerson || !_defaultResource) return;
        await store.transferModalsService.add(_currentPerson, 'person', _currentPerson, 'person', _defaultResource);
        store.transfersResource.reload();
      },

      async export(type: string): Promise<void> {
        console.log(`TransferListStore.export(${type}) is not yet implemented.`);
      },

      async edit(transfer?: TransferModel): Promise<void> {
        await store.transferModalsService.edit(transfer);
        store.transfersResource.reload();
      },

      async delete(transfer?: TransferModel): Promise<void> {
        if (transfer) {
          await store.transferService.delete(transfer, store.currentUser());
          store.transfersResource.reload();
        }
      },
    }
  }),
);
