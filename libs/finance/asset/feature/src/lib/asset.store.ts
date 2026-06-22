import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AssetModel, BookingLineModel, BookingModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { AssetCategoryService, AssetService } from '@bk2/finance-asset-data-access';
import { ASSET_I18N_KEYS, AssetI18n, linearDepreciationMonthly, proRataMonths } from '@bk2/finance-asset-util';
import { BookingService } from '@bk2/finance-booking-data-access';

import { AssetEditModal } from './asset-edit.modal';

export type { AssetI18n };

export const AssetStore = signalStore(
  withState({
    previewLines: [] as BookingLineModel[],
    pendingBooking: null as { booking: BookingModel; lines: BookingLineModel[] } | null,
  }),
  withProps(() => ({
    assetService: inject(AssetService),
    assetCategoryService: inject(AssetCategoryService),
    accountingStore: inject(AccountingStore),
    bookingService: inject(BookingService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(ASSET_I18N_KEYS),
  })),
  withProps(store => ({
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
    tenantId: computed(() => store.appStore.tenantId()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    setPeriodEnd(end: string): void {

    },
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

    async preview(periodEnd: string): Promise<void> {
      const lines: BookingLineModel[] = [];

      for (const asset of store.assets()) {
        const months = proRataMonths(asset.commissioningDate ?? asset.acquisitionDate, periodEnd);
        if (months <= 0) continue;
        const acquisitionCents = asset.acquisitionValue?.amount ?? 0;
        const monthly = linearDepreciationMonthly(acquisitionCents, asset.usefulLifeMonths ?? 1);
        const periodDepreciation = monthly * months;
        if (periodDepreciation <= 0) continue;

        const drLine = new BookingLineModel(store.tenantId(), store.accountingTenantId());
        drLine.accountKey = asset.expenseAccountKey;
        drLine.debitAmount = { amount: periodDepreciation, currency: 'CHF', periodicity: 'one-time' };
        lines.push(drLine);

        const crLine = new BookingLineModel(store.tenantId(), store.accountingTenantId());
        crLine.accountKey = asset.balanceAccountKey;
        crLine.creditAmount = { amount: periodDepreciation, currency: 'CHF', periodicity: 'one-time' };
        lines.push(crLine);
      }

      if (lines.length === 0) {
        patchState(store, { previewLines: [], pendingBooking: null });
        return;
      }

      const year = parseInt(periodEnd.substring(0, 4), 10);
      const seq = await store.bookingService.nextSequence(year, store.accountingTenantId());
      const booking = new BookingModel(store.tenantId(), store.accountingTenantId());
      booking.bookingNo = seq;
      booking.date = periodEnd;
      booking.title = `${store.i18n.deduction()} ${periodEnd}`;
      booking.status = 'draft';

      patchState(store, { previewLines: lines, pendingBooking: { booking, lines } });
    },

    async post(): Promise<void> {
      const pending = store.pendingBooking();
      if (!pending) return;
      await store.bookingService.create(pending.booking, pending.lines, store.currentUser() ?? undefined);
      patchState(store, { previewLines: [], pendingBooking: null });
    }
  }))
);
