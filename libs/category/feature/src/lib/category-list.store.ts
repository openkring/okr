import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { chipMatches, debugListLoaded, nameMatches } from '@bk2/shared/util-core';
import { CategoryListModel, ModelType } from '@bk2/shared/models';
import { AppStore } from '@bk2/shared/feature';

import { isCategoryList } from '@bk2/category/util';
import { CategoryService } from '@bk2/category/data-access';
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
      loader: () => {
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
        return store.appStore.getTags(ModelType.Category);
      },

      /******************************** actions ******************************************* */
      async add(defaultCategoryName?: string): Promise<void> {
        let _defaultCategory: CategoryListModel | undefined;
          if (defaultCategoryName) {
            _defaultCategory = await firstValueFrom(store.categoryService.read(defaultCategoryName));
          }
          const _newCategory = structuredClone(_defaultCategory) ?? new CategoryListModel(store.appStore.tenantId());
          const _modal = await store.modalController.create({
            component: CategoryEditModalComponent,
            componentProps: {
              category: _newCategory,
              currentUser: store.currentUser()
            }
          });
          _modal.present();
          const { data, role } = await _modal.onDidDismiss();
          if (role === 'confirm') {
            if (isCategoryList(data, store.appStore.env.tenantId)) {
              await store.categoryService.create(data, store.currentUser());
            }
          }
          store.categoriesResource.reload();
      },

      async edit(category: CategoryListModel): Promise<void> {
        const _modal = await store.modalController.create({
          component: CategoryEditModalComponent,
          componentProps: {
            category: category,
            currentUser: store.currentUser()
          }
        });
        _modal.present();
        const { data, role } = await _modal.onDidDismiss();
        if (role === 'confirm') {
          if (isCategoryList(data, store.appStore.tenantId())) {
            await store.categoryService.update(data, store.currentUser());
          }
        }
        store.categoriesResource.reload();
      },

      async delete(cat: CategoryListModel): Promise<void> {
        await store.categoryService.delete(cat, store.currentUser());
        this.reset();
      },

      async export(type: string): Promise<void> {
        console.log(`CategoryListStore.export(${type}) is not yet implemented.`);
      }
    }
  })
);
