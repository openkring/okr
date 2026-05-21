import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { CategoryListModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, isCategoryList, nameMatches } from '@bk2/shared-util-core';

import { CategoryService } from '@bk2/category-data-access';

import { CategoryEditModal } from './category-edit.modal';

export type CategoryState = {
  searchTerm: string;
  selectedTag: string;
};

export const initialState: CategoryState = {
  searchTerm: '',
  selectedTag: '',
};

const PFX = '@category.';

const CATEGORY_I18N_KEYS = {
  categories:           PFX + 'categories',
  empty:                PFX + 'empty',
  view:                 PFX + 'view',
  edit:                 PFX + 'edit',
  create:               PFX + 'create',
  delete:               PFX + 'delete',
  as_title:             '@actionsheet.title',
  ok: '@ok',
  cancel: '@cancel',
  changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
  changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
  changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  bkey_label:              '@category/ui.bkey.label',
  bkey_placeholder:        '@category/ui.bkey.placeholder',
  bkey_helper:             '@category/ui.bkey.helper',
  name_label:              '@category/ui.name.label',
  name_placeholder:        '@category/ui.name.placeholder',
  name_helper:             '@category/ui.name.helper',
  i18nBase_label:          '@category/ui.i18nBase.label',
  i18nBase_placeholder:    '@category/ui.i18nBase.placeholder',
  i18nBase_helper:         '@category/ui.i18nBase.helper',
  notes_label:             '@category/ui.notes.label',
  notes_placeholder:       '@category/ui.notes.placeholder',
  translateItems_label:    '@category/ui.translateItems.label',
  translateItems_helper:   '@category/ui.translateItems.helper',
} satisfies Record<string, string>;

export type CategoryI18n = { [K in keyof typeof CATEGORY_I18N_KEYS]: Signal<string> };

export const CategoryStore = signalStore(
  withState(initialState),
  withProps(() => ({
    categoryService: inject(CategoryService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(CATEGORY_I18N_KEYS),
  })),
  withProps((store) => ({
    categoriesResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser()
      }),
      stream: ({params}) => {
        return store.categoryService.list().pipe(
          debugListLoaded<CategoryListModel>('CategoryStore.categoriesResource', params.currentUser)
        );
      }
    })
  })),

  withComputed((store) => {
    return {
      categories: computed(() => store.categoriesResource.value()),
      categoriesCount: computed(() => store.categoriesResource.value()?.length ?? 0), 
      filteredCategories: computed(() => 
        store.categoriesResource.value()?.filter((cat: CategoryListModel) => 
          nameMatches(cat.index, store.searchTerm()) &&
          chipMatches(cat.tags, store.selectedTag()))
      ),
      isLoading: computed(() => store.categoriesResource.isLoading()),
      currentUser: computed(() => store.appStore.currentUser()),
      tenantId: computed(() => store.appStore.tenantId())
    };
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        store.categoriesResource.reload();
      },
   
      /******************************** setters (filter) ******************************************* */
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('category');
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) { console.log('CategoryStore.add: readOnly mode.'); return; }
        const cat = new CategoryListModel(store.appStore.tenantId());
          await this.edit(cat, readOnly);
      },

      async edit(category: CategoryListModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: CategoryEditModal,
          componentProps: {
            category,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            hasAbbreviation: category.hasAbbreviation,
            readOnly,
          }
        }); 
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isCategoryList(data, store.appStore.tenantId())) {
            category.bkey === '' ?
              await store.categoryService.create(data, store.currentUser()) : 
              await store.categoryService.update(data, store.currentUser());
          }
        }
        store.categoriesResource.reload();
      },

      async delete(cat: CategoryListModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.categoryService.delete(cat, store.currentUser());
        this.reset();
      },

      async export(type: string): Promise<void> {
        console.log(`CategoryStore.export(${type}) is not yet implemented.`);
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.edit();
        } else {
          return store.i18n.create();
        }
      },
    }
  })
);
