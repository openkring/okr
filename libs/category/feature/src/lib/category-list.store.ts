import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@bk2/shared-feature';
import { CategoryListModel } from '@bk2/shared-models';
import { chipMatches, debugListLoaded, nameMatches } from '@bk2/shared-util-core';

import { CategoryService } from '@bk2/category-data-access';
import { isCategoryList } from '@bk2/category-util';

import { CategoryEditModalComponent } from './category-edit.modal';

export type CategoryListState = {
  searchTerm: string;
  selectedTag: string;
};

export const initialState: CategoryListState = {
  searchTerm: '',
  selectedTag: '',
};

export const CategoryListStore = signalStore(
  withState(initialState),
  withProps(() => ({
    categoryService: inject(CategoryService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),    
  })),
  withProps((store) => ({
    categoriesResource: rxResource({
      stream: () => {
        const categories$ = store.categoryService.list();
        debugListLoaded<CategoryListModel>('CategoryListStore.category', categories$, store.appStore.currentUser());
        return categories$;
      }
    })
  })),

  withComputed((state) => {
    return {
      categories: computed(() => state.categoriesResource.value()),
      categoriesCount: computed(() => state.categoriesResource.value()?.length ?? 0), 
      filteredCategories: computed(() => 
        state.categoriesResource.value()?.filter((cat: CategoryListModel) => 
          nameMatches(cat.index, state.searchTerm()) &&
          chipMatches(cat.tags, state.selectedTag()))
      ),
      isLoading: computed(() => state.categoriesResource.isLoading()),
      currentUser: computed(() => state.appStore.currentUser()),
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
      async add(defaultCategoryName?: string, readOnly = true): Promise<void> {
        let defaultCategory: CategoryListModel | undefined;
          if (defaultCategoryName) {
            defaultCategory = await firstValueFrom(store.categoryService.read(defaultCategoryName));
          }
          const newCategory = this.duplicateCategory(defaultCategory);
          await this.edit(newCategory, readOnly);
      },

      duplicateCategory(category?: CategoryListModel): CategoryListModel {
        if (!category) return new CategoryListModel(store.appStore.tenantId());
        const duplicatedCategory = structuredClone(category);
        duplicatedCategory.bkey = '';
        return duplicatedCategory;
      },

      async edit(category: CategoryListModel, readOnly = true): Promise<void> {
        const modal = await store.modalController.create({
          component: CategoryEditModalComponent,
          componentProps: {
            category,
            readOnly,
            currentUser: store.currentUser()
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm') {
          if (isCategoryList(data, store.appStore.tenantId())) {
            category.bkey === '' ? await store.categoryService.create(data, store.currentUser()) : await store.categoryService.update(data, store.currentUser());
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
        console.log(`CategoryListStore.export(${type}) is not yet implemented.`);
      }
    }
  })
);
