import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { WebsiteContentCollection, WebsiteContentModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';
import { getSystemQuery } from '@bk2/shared-util-core';

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
      const key = await bkPrompt(store.alertController, '@aoc.website.key.prompt', '');
      if (!key) return;
      const item = new WebsiteContentModel(store.appStore.env.tenantId);
      item.key = key.trim();
      await store.firestoreService.createModel<WebsiteContentModel>(
        WebsiteContentCollection, item, '@aoc.website.operation.create', store.appStore.currentUser(),
      );
    },

    async saveItem(item: WebsiteContentModel): Promise<void> {
      await store.firestoreService.updateModel<WebsiteContentModel>(
        WebsiteContentCollection, item, false, '@aoc.website.operation.update', store.appStore.currentUser(),
      );
    },

    async deleteItem(item: WebsiteContentModel): Promise<void> {
      await store.firestoreService.deleteModel<WebsiteContentModel>(
        WebsiteContentCollection, item, '@aoc.website.operation.delete', store.appStore.currentUser(),
      );
    },
  })),
);
