import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';

import { FIRESTORE } from '@bk2/shared/config';
import { chipMatches, getYear, nameMatches } from '@bk2/shared/util';
import { getSystemQuery, searchData } from '@bk2/shared/data-access';
import { categoryMatches, yearMatches } from '@bk2/shared/categories';
import { AllCategories, ModelType, TransferCollection, TransferModel, TransferType } from '@bk2/shared/models';

import { AppStore } from '@bk2/auth/feature';

import { TransferService } from '@bk2/transfer/data-access';
import { TransferModalsService } from './transfer-modals.service';

export type TransferListState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: TransferType | typeof AllCategories;
  selectedYear: number;
  selectedState: number;
};

export const initialTransferListState: TransferListState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: AllCategories,
  selectedYear: getYear(),
  selectedState: AllCategories,
};

export const TransferListStore = signalStore(
  withState(initialTransferListState),
  withProps(() => ({
    transferService: inject(TransferService),
    transferModalsService: inject(TransferModalsService),
    appStore: inject(AppStore),
    firestore: inject(FIRESTORE),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    transfersResource: rxResource({
      loader: () => {
        return searchData<TransferModel>(store.firestore, TransferCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc');
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
          categoryMatches(transfer.type, state.selectedType()) &&
          categoryMatches(transfer.state, state.selectedState()) &&
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

      setSelectedType(selectedType: TransferType | typeof AllCategories) {
        patchState(store, { selectedType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedState(selectedState: number) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags(ModelType.Transfer);
      },

      /******************************** actions ******************************************* */
      async add(): Promise<void> {
        const _currentPerson = store.currentPerson();
        const _defaultResource = store.defaultResource();
        if (!_currentPerson || !_defaultResource) return;
        await store.transferModalsService.add(_currentPerson, ModelType.Person, _currentPerson, ModelType.Person, _defaultResource);
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
          await store.transferService.delete(transfer);
          store.transfersResource.reload();
        }
      },
    }
  }),
);
