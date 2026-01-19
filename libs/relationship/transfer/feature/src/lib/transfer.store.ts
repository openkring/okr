import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, ModelSelectService } from '@bk2/shared-feature';
import { AvatarInfo, CategoryListModel, TransferCollection, TransferModel } from '@bk2/shared-models';
import { chipMatches, DateFormat, getAvatarInfo, getAvatarInfoArray, getSystemQuery, getTodayStr, nameMatches } from '@bk2/shared-util-core';

import { TransferService } from '@bk2/relationship-transfer-data-access';
import { isTransfer } from '@bk2/relationship-transfer-util';

import { TransferEditModalComponent } from './transfer-edit.modal';

export type TransferState = {
  searchTerm: string;
  selectedTag: string;
  selectedType: string;
  selectedYear: number;
  selectedState: string;
};

export const initialTransferState: TransferState = {
  searchTerm: '',
  selectedTag: '',
  selectedType: 'all',
  selectedYear: 99,
  selectedState: 'all',
};

export const TransferStore = signalStore(
  withState(initialTransferState),
  withProps(() => ({
    transferService: inject(TransferService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    modelSelectService: inject(ModelSelectService)
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
          yearMatches(transfer.dateOfTransfer, state.selectedYear()) &&
          nameMatches(transfer.type, state.selectedType()) &&
          nameMatches(transfer.state, state.selectedState()) &&
          chipMatches(transfer.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.transfersResource.isLoading()),
      tenantId: computed(() => state.appStore.tenantId()),
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

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('transfer_type');
      }, 

      getStates(): CategoryListModel {
        return store.appStore.getCategory('transfer_state');
      },

      getPeriodicities(): CategoryListModel {
        return store.appStore.getCategory('periodicity');
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) return;
        const currentPerson = store.currentPerson();
        const defaultResource = store.defaultResource();
        if (!currentPerson || !defaultResource) return;
        const newTransfer = new TransferModel(store.tenantId());
        newTransfer.subjects = getAvatarInfoArray(currentPerson, 'person');
        newTransfer.objects = getAvatarInfoArray(currentPerson, 'person');
        const resourceAvatar = getAvatarInfo(defaultResource);
        if (resourceAvatar) newTransfer.resource = resourceAvatar;
        newTransfer.dateOfTransfer = getTodayStr(DateFormat.StoreDate);
        await this.edit(newTransfer, readOnly);
        store.transfersResource.reload();
      },

      /**
       * Show a modal to edit, view (readOnly = true) or create a transfer relationship.
       * @param transfer the transfer relationship to edit
       * @param readOnly 
       */
      async edit(transfer?: TransferModel, readOnly = true): Promise<void> {
        if (transfer && !readOnly) {
        const modal = await store.modalController.create({
          component: TransferEditModalComponent,
          componentProps: {
            transfer,
            currentUser: store.currentUser(),
            types: this.getTypes(),
            states: this.getStates(),
            periodicities: this.getPeriodicities(),
            tags: this.getTags(),
            tenantId: store.tenantId(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isTransfer(data, store.tenantId())) {
            await (!data.bkey ? 
              store.transferService.create(data, store.currentUser()) : 
              store.transferService.update(data, store.currentUser()));
          }
        }
          store.transfersResource.reload();
        }
      },

      async delete(transfer?: TransferModel, readOnly = true): Promise<void> {
        if (transfer && !readOnly) {
          await store.transferService.delete(transfer, store.currentUser());
          store.transfersResource.reload();
        }
      },

      async export(type: string): Promise<void> {
        console.log(`TransferStore.export(${type}) is not yet implemented.`);
      },

      async selectPersonAvatar(): Promise<AvatarInfo | undefined> {
        return await store.modelSelectService.selectPersonAvatar('','');
      },

      async selectResourceAvatar(): Promise<AvatarInfo | undefined> {
        return await store.modelSelectService.selectResourceAvatar();
      }
    }
  })
);
