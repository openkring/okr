import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { I18nDefaultCollection, I18nDefaultModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';
import { PFX } from './scope';

export type I18nDefaultState = { searchTerm: string };
const initialState: I18nDefaultState = { searchTerm: '' };

export const I18nDefaultStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      create_conf:  PFX + 'operation.create.default.conf',
      create_error: PFX + 'operation.create.default.error',
      update_conf:  PFX + 'operation.update.default.conf',
      update_error: PFX + 'operation.update.default.error',
      delete_conf:  PFX + 'operation.delete.default.conf',
      delete_error: PFX + 'operation.delete.default.error',
    }),
  })),
  withProps(store => ({
    contentResource: rxResource({
      params: () => ({ fbUser: store.appStore.fbUser() }),
      stream: ({ params }) => {
        if (!params.fbUser) return of([] as I18nDefaultModel[]);
        return store.firestoreService.searchData<I18nDefaultModel>(
          I18nDefaultCollection,
          [{ key: 'isArchived', operator: '==', value: false }],
          'module',
          'asc',
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.contentResource.isLoading()),
    filteredItems: computed(() => {
      const term = store.searchTerm().toLowerCase().trim();
      const all = (store.contentResource.value() ?? []) as I18nDefaultModel[];
      return term
        ? all.filter(i =>
            i.module.toLowerCase().includes(term) ||
            i.key.toLowerCase().includes(term) ||
            i.de.toLowerCase().includes(term),
          )
        : all;
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    async createItem(): Promise<void> {
      const module = await bkPrompt(store.alertController, '@i18n.default.module.prompt', '');
      if (!module) return;
      const key = await bkPrompt(store.alertController, '@i18n.default.key.prompt', '');
      if (!key) return;
      const item = new I18nDefaultModel();
      item.module = module.trim();
      item.key = key.trim();
      await store.firestoreService.createModel<I18nDefaultModel>(I18nDefaultCollection, item, store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser());
    },

    async saveItem(item: I18nDefaultModel): Promise<void> {
      await store.firestoreService.updateModel<I18nDefaultModel>(I18nDefaultCollection, item, false, store.i18n.update_conf(), store.i18n.update_error(), store.appStore.currentUser());
    },

    async deleteItem(item: I18nDefaultModel): Promise<void> {
      await store.firestoreService.deleteModel<I18nDefaultModel>(I18nDefaultCollection, item, store.i18n.delete_conf(), store.i18n.delete_error(), store.appStore.currentUser());
    },
  })),
);
