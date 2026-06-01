import { computed, inject, Signal } from '@angular/core';
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

const I18N_DEFAULT_I18N_KEYS = {
  module:             PFX + 'module.label',
  module_prompt:      PFX + 'module.prompt',
  key:                PFX + 'key.label',
  key_prompt:         PFX + 'key.prompt',
  is_html:            PFX + 'isHtml.label',
  create:             PFX + 'create.label',
  create_conf:        PFX + 'create.conf',
  create_error:       PFX + 'create.error',
  update:             PFX + 'update.label',
  update_conf:        PFX + 'update.conf',
  update_error:       PFX + 'update.error',
  delete:             PFX + 'delete.label',
  delete_conf:        PFX + 'delete.conf',
  delete_confirm:     PFX + 'delete.confirm',
  delete_error:       PFX + 'delete.error',

  default_title:      PFX + 'default.title',
  default_edit_title: PFX + 'default.edit.title',
  default_list_title: PFX + 'default.list.title',

  ok:                 '@ok',
  cancel:             '@cancel',
  as_title:           '@actionsheet.title',
  save:               '@save.label',
  search_placeholder: '@search.placeholder',
  loading:            '@loading'
} satisfies Record<string, string>;

export type I18nDefaultI18n = { [K in keyof typeof I18N_DEFAULT_I18N_KEYS]: Signal<string> };

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
    i18n: store.i18nService.translateAll(I18N_DEFAULT_I18N_KEYS),
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
      const module = await bkPrompt(store.alertController, store.i18n.module_prompt(), '', store.i18n.ok(), store.i18n.cancel());
      if (!module) return;
      const key = await bkPrompt(store.alertController, store.i18n.key_prompt(), '', store.i18n.ok(), store.i18n.cancel());
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
