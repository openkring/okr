import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { FolderCollection, FolderModel } from '@bk2/shared-models';
import { debugItemLoaded, debugListLoaded, getSystemQuery, nameMatches } from '@bk2/shared-util-core';
import { AlertService } from '@bk2/shared-util-angular';

import { FolderService } from '@bk2/folder-data-access';
import { newFolderModel } from '@bk2/folder-util';

// Inline import to avoid circular dependency (same lib)
import { FolderEditModal } from './folder-edit.modal';

const FOLDER_I18N_KEYS = {
  delete_confirm:                  '@folder.operation.delete.confirm',
  plural:                          '@folder.plural',
  empty:                           '@folder.empty',
  changeConfirmation_ok:           '@folder/feature.changeConfirmation.ok',
  changeConfirmation_cancel:       '@folder/feature.changeConfirmation.cancel',
  changeConfirmation_confirmation: '@folder/feature.changeConfirmation.confirmation',
  name_label:               '@folder/ui.name.label',
  name_placeholder:         '@folder/ui.name.placeholder',
  name_helper:              '@folder/ui.name.helper',
  title_label:              '@folder/ui.title.label',
  title_placeholder:        '@folder/ui.title.placeholder',
  title_helper:             '@folder/ui.title.helper',
  description_label:        '@folder/ui.description.label',
  description_placeholder:  '@folder/ui.description.placeholder',
  as_edit:                  '@folder/feature.actionsheet.edit',
  as_delete:                '@folder/feature.actionsheet.delete',
  cancel:                   '@cancel',
} satisfies Record<string, string>;

export type FolderI18n = { [K in keyof typeof FOLDER_I18N_KEYS]: Signal<string> };

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
    alertService: inject(AlertService),
    folderService: inject(FolderService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(FOLDER_I18N_KEYS),
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
        component: FolderEditModal,
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
      const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (result === true) {
        await store.folderService.delete(folder, store.currentUser());
        this.reload();
      }
    },
  })),
);
