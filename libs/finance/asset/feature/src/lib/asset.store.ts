import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AssetModel } from '@okr/shared-models';
import { getTodayStr } from '@okr/shared-util-core';
import { exportCsv } from '@okr/shared-util-angular';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { AssetCategoryService, AssetMovementService, AssetService } from '@okr/finance-asset-data-access';
import { ASSET_I18N_KEYS, AssetI18n, depreciationBookingKey, depreciationPlan } from '@okr/finance-asset-util';
import { fiscalYearOptions } from '@okr/finance-accounting-util';
import { fiscalYear, fiscalYearOf } from '@okr/finance-reporting-util';

export type { AssetI18n };

export const AssetStore = signalStore(
  // the depreciation run's fiscal year (0 = the current one) and whether a run is being booked (spec 1.103)
  withState({ selectedYear: 0, posting: false }),
  withProps(() => ({
    assetService: inject(AssetService),
    assetCategoryService: inject(AssetCategoryService),
    accountingStore: inject(AccountingStore),
    movementService: inject(AssetMovementService),
    toastController: inject(ToastController),
    costCenterStore: inject(CostCenterStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18n: inject(I18nService).translateAll(ASSET_I18N_KEYS),
  })),
  withProps(store => ({
    assetsResource: rxResource({
      stream: () => store.assetService.list(store.accountingStore.accountingTenantId()),
    }),
    movementsResource: rxResource({
      stream: () => store.movementService.list(store.accountingStore.accountingTenantId()),
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
    fiscalYearStart: computed(() => store.accountingStore.config()?.fiscalYearStart ?? 1),
  })),
  withComputed(store => ({
    currentYear: computed(() => fiscalYearOf(getTodayStr(), store.fiscalYearStart())),
  })),
  withComputed(store => ({
    year: computed(() => store.selectedYear() || store.currentYear()),
    yearOptions: computed(() => fiscalYearOptions(store.currentYear(), 10)),
  })),
  withComputed(store => ({
    fiscalRange: computed(() => fiscalYear(store.year(), store.fiscalYearStart())),
  })),
  withComputed(store => ({
    /** the selected year's run: per asset book value, depreciation and whether it is booked */
    plan: computed(() => depreciationPlan(store.assets(), store.movementsResource.value() ?? [], store.fiscalRange())),
    /** the run's booking key, once the year is booked */
    bookedKey: computed(() => {
      const key = depreciationBookingKey(store.accountingTenantId(), store.year());
      return (store.movementsResource.value() ?? []).some(m => m.bookingKey === key) ? key : '';
    }),
  })),
  withComputed(store => ({
    planTotal: computed(() => store.plan().reduce((s, r) => s + r.amount, 0)),
    /** something left to book in the selected year */
    canPost: computed(() => !store.isReadOnly() && !store.bookedKey() && store.plan().some(r => r.booked === undefined && r.amount > 0)),
  })),
  withMethods(store => ({
    /** the category's name for the list ('' while unknown) */
    categoryName(categoryKey: string): string {
      return store.categories().find(c => c.okey === categoryKey)?.name ?? '';
    },

    /** «Exportieren» (c-asset): the register as CSV */
    async export(): Promise<void> {
      const i18n = store.i18n;
      const rows: string[][] = [[i18n.number(), i18n.name(), i18n.category(), i18n.acquisition_date(), i18n.acquisition_value(), i18n.life()]];
      for (const a of store.assets()) {
        rows.push([a.assetNo, a.name, this.categoryName(a.categoryKey), a.acquisitionDate,
          ((a.acquisitionValue?.amount ?? 0) / 100).toFixed(2), String(a.usefulLifeMonths ?? '')]);
      }
      await exportCsv(rows, `anlagen-${getTodayStr()}`);
    },

    async openEdit(asset: AssetModel, readOnly = true): Promise<void> {
      const { AssetEditModal } = await import('@okr/finance-asset-ui');
      const modal = await store.modalController.create({
        component: AssetEditModal,
        componentProps: {
          asset,
          categories: store.categories(),
          readOnly,
          currentUser: store.currentUser(),
          costCenters: store.costCenterStore.costCenters(),
          costCenterEnabled: store.costCenterStore.isEnabled(),
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const a = data as AssetModel;
        if (a.okey?.length > 0) {
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

    selectYear(year: number): void {
      patchState(store, { selectedYear: year });
    },

    /**
     * «Abschreibungen {year} buchen»: the server computes and books the run (spec 1.103) — one booking
     * per books and year, one movement per asset; the movements stream then shows the year as booked.
     */
    async postDepreciation(): Promise<void> {
      if (!store.canPost() || store.posting()) return;
      patchState(store, { posting: true });
      try {
        const result = await store.movementService.postDepreciation(store.accountingTenantId(), store.year());
        await this.toast(store.i18n.run_booked().replace('{n}', String(result.bookingNo)));
      } catch (error) {
        const reason = (error as { details?: { reason?: string } })?.details?.reason;
        await this.toast(
          reason === 'period-locked' ? store.i18n.run_periodLocked()
          : reason === 'asset-accounts-missing' ? store.i18n.run_accountsMissing()
          : reason === 'already-booked' ? store.i18n.run_alreadyBooked()
          : store.i18n.run_failed());
      } finally {
        patchState(store, { posting: false });
      }
    },

    async toast(message: string): Promise<void> {
      const t = await store.toastController.create({ message, duration: 3000 });
      await t.present();
    },
  }))
);
