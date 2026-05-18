import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { WebsiteContentCollection, WebsiteContentModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';
import { getSystemQuery } from '@bk2/shared-util-core';
import { PFX } from './scope';

export type AocWebsiteState = {
  searchTerm: string;
};

export const initialState: AocWebsiteState = {
  searchTerm: '',
};

export const AocWebsiteStore = signalStore(
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
      key_label: PFX + 'website.key.label',
      create_conf:  PFX + 'website.create.conf',
      create_error: PFX + 'website.create.error',
      update_conf:  PFX + 'website.update.conf',
      update_error: PFX + 'website.update.error',
      delete_conf:  PFX + 'website.delete.conf',
      delete_error: PFX + 'website.delete.error',
      delete_confirm: PFX + 'website.delete.confirm',
      ok:               '@ok',
      cancel:           '@cancel',
      search_placeholder: '@general.operation.search.placeholder',
      list_title:       PFX + 'website.list.title',
      loading:          '@general.operation.loading',
    }),
  })),
  withProps(store => ({
    contentResource: rxResource({
      params: () => ({
        fbUser: store.appStore.fbUser(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.fbUser || !params.tenantId) return of([] as WebsiteContentModel[]);
        return store.firestoreService.searchData<WebsiteContentModel>(
          WebsiteContentCollection,
          getSystemQuery(params.tenantId),
          'key',
          'asc',
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.contentResource.isLoading()),
    allItems: computed(() => (store.contentResource.value() ?? []) as WebsiteContentModel[]),
    filteredItems: computed(() => {
      const term = store.searchTerm().toLowerCase().trim();
      const all = (store.contentResource.value() ?? []) as WebsiteContentModel[];
      return term
        ? all.filter(item => item.key.toLowerCase().includes(term) || item.de.toLowerCase().includes(term))
        : all;
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    async createItem(): Promise<void> {
      const key = await bkPrompt(store.alertController, store.i18n.key_label(), '', store.i18n.ok(), store.i18n.cancel());
      if (!key) return;
      const item = new WebsiteContentModel(store.appStore.env.tenantId);
      item.key = key.trim();
      await store.firestoreService.createModel<WebsiteContentModel>(
        WebsiteContentCollection, item, store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser(),
      );
    },

    async saveItem(item: WebsiteContentModel): Promise<void> {
      await store.firestoreService.updateModel<WebsiteContentModel>(
        WebsiteContentCollection, item, false, store.i18n.update_conf(), store.i18n.update_error(), store.appStore.currentUser(),
      );
    },

    async deleteItem(item: WebsiteContentModel): Promise<void> {
      await store.firestoreService.deleteModel<WebsiteContentModel>(
        WebsiteContentCollection, item, store.i18n.delete_conf(), store.i18n.delete_error(), store.appStore.currentUser(),
      );
    },
  })),
);
