import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { FolderCollection, FolderModel } from '@bk2/shared-models';
import { debugItemLoaded, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { confirm } from '@bk2/shared-util-angular';

import { FolderService } from '@bk2/folder-data-access';
import { newFolderModel } from '@bk2/folder-util';

// Inline import to avoid circular dependency (same lib)
import { FolderEditModalComponent } from './folder-edit.modal';

export type FolderState = {
  folderKey: string;
  searchTerm: string;
};

const initialState: FolderState = {
  folderKey: '',
  searchTerm: '',
};

export const FolderStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    folderService: inject(FolderService),
  })),
  withProps((store) => ({
    foldersResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) =>
        store.firestoreService.searchData<FolderModel>(
          FolderCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc'
        ).pipe(debugListLoaded<FolderModel>('FolderStore.folders', params.currentUser)),
    }),

    folderResource: rxResource({
      params: () => ({ folderKey: store.folderKey(), currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        const key = params.folderKey;
        if (!key) return new Observable<FolderModel>(() => {});
        return store.folderService.read(key).pipe(
          debugItemLoaded('FolderStore.folder', params.currentUser)
        );
      },
    }),
  })),

  withComputed((state) => ({
    folders: computed(() => state.foldersResource.value() ?? []),
    isLoading: computed(() => state.foldersResource.isLoading()),
    folder: computed(() => state.folderResource.value()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),

  withComputed((state) => ({
    filteredFolders: computed(() =>
      state.folders().filter(f => nameMatches(f.index, state.searchTerm()))
    ),
  })),

  withMethods((store) => ({
    setFolderKey(folderKey: string) { patchState(store, { folderKey }); },
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },

    reload() {
      store.foldersResource.reload();
      store.folderResource.reload();
    },

    async add(): Promise<void> {
      const currentUser = store.currentUser();
      if (!currentUser) return;
      const folder = newFolderModel(store.tenantId());
      await this.edit(folder, false);
    },

    async edit(folder: FolderModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: FolderEditModalComponent,
        componentProps: {
          folder,
          currentUser: store.currentUser(),
          readOnly,
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly) {
        data.bkey?.length === 0
          ? await store.folderService.create(data, store.currentUser())
          : await store.folderService.update(data, store.currentUser());
        this.reload();
      }
    },

    async delete(folder?: FolderModel): Promise<void> {
      if (!folder) return;
      const result = await confirm(store.alertController, '@folder.operation.delete.confirm', true);
      if (result === true) {
        await store.folderService.delete(folder, store.currentUser());
        this.reload();
      }
    },
  })),
);
