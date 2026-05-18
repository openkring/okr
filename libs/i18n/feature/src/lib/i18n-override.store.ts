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
      create_conf:  PFX + 'override.create.conf',
      create_error: PFX + 'override.create.error',
      update_conf:  PFX + 'override.update.conf',
      update_error: PFX + 'override.update.error',
      delete_conf:  PFX + 'override.delete.conf',
      delete_confirm:  PFX + 'override.delete.confirm',
      delete_error: PFX + 'override.delete.error',
      module_prompt: PFX + 'override.module.prompt',
      key_prompt: PFX + 'override.key.prompt',
      ok: '@ok',
      cancel: '@cancel',
      search_placeholder: '@general.operation.search.placeholder',
      list_title:         '@i18n.override.list.title',
      loading:            '@general.operation.loading',
      module_label:       '@i18n.override.module.label',
      key_label:          '@i18n.override.key.label',
      is_html_label:      '@i18n.override.isHtml.label',
      btn_cancel:         '@general.operation.cancel',
      btn_save:           '@general.operation.save',
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
      const module = await bkPrompt(store.alertController, store.i18n.module_prompt(), '', store.i18n.ok(), store.i18n.cancel());
      if (!module) return;
      const key = await bkPrompt(store.alertController, store.i18n.key_prompt(), '', store.i18n.ok(), store.i18n.cancel());
      if (!key) return;
      const item = new I18nTenantOverrideModel(store.appStore.env.tenantId);
      item.module = module.trim();
      item.key = key.trim();
      await store.firestoreService.createModel<I18nTenantOverrideModel>(I18nTenantOverrideCollection, item, 
        store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser());
    },

    async saveItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.updateModel<I18nTenantOverrideModel>(I18nTenantOverrideCollection, item, false, 
        store.i18n.update_conf(), store.i18n.update_error(), store.appStore.currentUser());
    },

    async deleteItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.deleteModel<I18nTenantOverrideModel>(I18nTenantOverrideCollection, item, 
        store.i18n.delete_conf(), store.i18n.delete_error(), store.appStore.currentUser());
    },
  })),
);
