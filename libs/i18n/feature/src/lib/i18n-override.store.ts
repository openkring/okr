import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { I18nTenantOverrideCollection, I18nTenantOverrideModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';
import { PFX } from './scope';

export type I18nOverrideState = { searchTerm: string };
const initialState: I18nOverrideState = { searchTerm: '' };

export const I18nOverrideStore = signalStore(
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
      create_conf:  PFX + 'operation.create.override.conf',
      create_error: PFX + 'operation.create.override.error',
      update_conf:  PFX + 'operation.update.override.conf',
      update_error: PFX + 'operation.update.override.error',
      delete_conf:  PFX + 'operation.delete.override.conf',
      delete_error: PFX + 'operation.delete.override.error',
    }),
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
      await store.firestoreService.createModel<I18nTenantOverrideModel>(I18nTenantOverrideCollection, item, store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser());
    },

    async saveItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.updateModel<I18nTenantOverrideModel>(I18nTenantOverrideCollection, item, false, store.i18n.update_conf(), store.i18n.update_error(), store.appStore.currentUser());
    },

    async deleteItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.deleteModel<I18nTenantOverrideModel>(I18nTenantOverrideCollection, item, store.i18n.delete_conf(), store.i18n.delete_error(), store.appStore.currentUser());
    },
  })),
);
