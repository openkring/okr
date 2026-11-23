import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore, TenantLabelService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CategoryListModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { chipMatches, debugListLoaded, isCategoryList, LIST_COPY_I18N_KEYS, ListCopyStatus, nameMatches, toI18nRef } from '@okr/shared-util-core';

import { CategoryService } from '@okr/category-data-access';
import { CATEGORY_I18N_KEYS, categoryCopyStatus, CategoryI18n, newItemLabels } from '@okr/category-util';

import { CategoryEditModal, CategoryEditResult } from './category-edit.modal';

export type { CategoryI18n };

export type CategoryState = {
  searchTerm: string;
  selectedTag: string;
};

export const initialState: CategoryState = {
  searchTerm: '',
  selectedTag: '',
};

export const CategoryStore = signalStore(
  withState(initialState),
  withProps(() => ({
    categoryService: inject(CategoryService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
    alertService: inject(AlertService),
    tenantLabelService: inject(TenantLabelService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(CATEGORY_I18N_KEYS),
    copyI18n: store.i18nService.translateAll(LIST_COPY_I18N_KEYS),
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

      copyStatus(category: CategoryListModel): ListCopyStatus<CategoryListModel> {
        return categoryCopyStatus(category, store.appStore.allCategories(), store.appStore.tenantId());
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<void> {
        if (readOnly) { console.log('CategoryStore.add: readOnly mode.'); return; }
        const cat = new CategoryListModel(store.appStore.tenantId());
          await this.edit(cat, readOnly);
      },

      /** Opens the editor; resolves to the list now in use, or undefined when nothing changed. */
      async edit(category: CategoryListModel, readOnly = true): Promise<CategoryListModel | undefined> {
        const modal = await store.modalController.create({
          component: CategoryEditModal,
          componentProps: {
            category,
            currentUser: store.currentUser(),
            tagModel: 'category',
            hasAbbreviation: category.hasAbbreviation,
            readOnly,
          }
        }); 
        modal.present();
        const { data, role } = await modal.onDidDismiss<CategoryEditResult>();
        if (role === 'confirm' && data && !readOnly && isCategoryList(data.list, store.appStore.tenantId())) {
          const { shared } = this.copyStatus(category);
          const key = category.okey === ''
            ? await store.categoryService.create(data.list, store.currentUser())
            : await store.categoryService.update(data.list, store.currentUser());
          store.categoriesResource.reload();
          if (!key) return undefined;
          store.appStore.reloadCategories();
          await this.saveItemLabels(data, category, shared);
          // a shared list was forked: the caller goes on with the tenant's own document
          return { ...data.list, okey: key, tenants: [store.appStore.tenantId()] };
        }
        if (role === 'restore' && !readOnly) return await this.archiveCopy(category);
        store.categoriesResource.reload();
        return undefined;
      },

      /** Labels for the items added in the editor; a label exists only where nothing else names the item. */
      async saveItemLabels(result: CategoryEditResult, loaded: CategoryListModel, shared?: CategoryListModel): Promise<void> {
        const tenantId = store.appStore.tenantId();
        for (const { key, labels } of newItemLabels(result.list, loaded, shared, result.itemLabels)) {
          const ref = toI18nRef(key);
          if (!ref || !await store.tenantLabelService.lacksLabel(key, tenantId)) continue;
          await store.tenantLabelService.saveOverride(ref.module, ref.key, tenantId, labels, undefined, undefined, store.i18n.update_error());
        }
      },

      async backToShared(category: CategoryListModel, readOnly = true): Promise<void> {
        if (readOnly || !await store.alertService.confirm(store.copyI18n.restore_confirm(), true)) return;
        await this.archiveCopy(category);
      },

      /** @returns the shared list that is in use from now on */
      async archiveCopy(category: CategoryListModel): Promise<CategoryListModel | undefined> {
        const status = this.copyStatus(category);
        if (status.kind !== 'copy') {
          store.categoriesResource.reload();
          await store.alertService.showToast(store.copyI18n.restore_none());
          return undefined;
        }
        const key = await store.categoryService.archiveCopy(category, store.currentUser(), store.copyI18n.restore_conf(), store.copyI18n.restore_error());
        store.categoriesResource.reload();
        if (!key) return undefined;
        store.appStore.reloadCategories();
        return status.shared;
      },

      async delete(cat: CategoryListModel, readOnly = true): Promise<void> {
        if (readOnly) return;
        await store.categoryService.delete(cat, store.currentUser());
        this.reset();
        store.appStore.reloadCategories();
      },

      async export(type: string): Promise<void> {
        console.log(`CategoryStore.export(${type}) is not yet implemented.`);
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.update();
        } else {
          return store.i18n.create();
        }
      },
    }
  })
);
