import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AssetModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { AssetCategoryService, AssetService } from '@bk2/finance-asset-data-access';
import { ASSET_I18N_KEYS, AssetI18n } from '@bk2/finance-asset-util';

import { AssetEditModal } from './asset-edit.modal';

export type { AssetI18n };

export const AssetStore = signalStore(
  withState({}),
  withProps(() => ({
    assetService: inject(AssetService),
    assetCategoryService: inject(AssetCategoryService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ASSET_I18N_KEYS),
    assetsResource: rxResource({
      stream: () => store.assetService.list(store.accountingStore.accountingTenantId()),
    }),
    categoriesResource: rxResource({
      stream: () => store.assetCategoryService.list(store.accountingStore.accountingTenantId()),
    }),
  })),
  withComputed(store => ({
    assets: computed(() => store.assetsResource.value() ?? []),
    categories: computed(() => store.categoriesResource.value() ?? []),
    isLoading: computed(() => store.assetsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    async openEdit(asset: AssetModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: AssetEditModal,
        componentProps: {
          asset,
          categories: store.categories(),
          readOnly,
          currentUser: store.currentUser(),
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const a = data as AssetModel;
        if (a.bkey?.length > 0) {
          await store.assetService.update(a, store.currentUser());
        } else {
          await store.assetService.create(a, store.currentUser());
        }
        store.assetsResource.reload();
      }
    },

    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const asset = new AssetModel(store.appStore.tenantId(), store.accountingStore.accountingTenantId());
      await this.openEdit(asset, false);
    },

    async delete(asset: AssetModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.assetService.delete(asset, store.currentUser());
      store.assetsResource.reload();
    },
  }))
);
