import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nTenantOverrideCollection, I18nTenantOverrideModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';

export type I18nOverrideState = { searchTerm: string };
const initialState: I18nOverrideState = { searchTerm: '' };

export const I18nOverrideStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
  })),
  withProps(store => ({
    contentResource: rxResource({
      params: () => ({
        fbUser: store.appStore.fbUser(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.fbUser || !params.tenantId) return of([] as I18nTenantOverrideModel[]);
        return store.firestoreService.searchData<I18nTenantOverrideModel>(
          I18nTenantOverrideCollection,
          [
            { key: 'tenantId', operator: '==', value: params.tenantId },
            { key: 'isArchived', operator: '==', value: false },
          ],
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
      const all = (store.contentResource.value() ?? []) as I18nTenantOverrideModel[];
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
      const module = await bkPrompt(store.alertController, '@i18n.override.module.prompt', '');
      if (!module) return;
      const key = await bkPrompt(store.alertController, '@i18n.override.key.prompt', '');
      if (!key) return;
      const item = new I18nTenantOverrideModel(store.appStore.env.tenantId);
      item.module = module.trim();
      item.key = key.trim();
      await store.firestoreService.createModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, item, '@i18n.override.operation.create', store.appStore.currentUser(),
      );
    },

    async saveItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.updateModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, item, false, '@i18n.override.operation.update', store.appStore.currentUser(),
      );
    },

    async deleteItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.deleteModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, item, '@i18n.override.operation.delete', store.appStore.currentUser(),
      );
    },
  })),
);
