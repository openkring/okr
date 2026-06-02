import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PeriodModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { PeriodService } from '@bk2/finance-period-data-access';
import { PERIOD_I18N_KEYS } from '@bk2/finance-period-util';

export const PeriodStore = signalStore(
  withState({}),
  withProps(() => ({
    periodService: inject(PeriodService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PERIOD_I18N_KEYS),
    periodsResource: rxResource({
      stream: () => store.periodService.list(store.accountingStore.accountingTenantId()),
    }),
  })),
  withComputed(store => ({
    periods: computed(() => store.periodsResource.value() ?? []),
    isLoading: computed(() => store.periodsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    async lock(period: PeriodModel): Promise<void> {
      if (store.isReadOnly()) return;
      const user = store.currentUser();
      if (!user) return;
      await store.periodService.lock(period, user);
      store.periodsResource.reload();
    },
    async unlock(period: PeriodModel): Promise<void> {
      if (store.isReadOnly()) return;
      const user = store.currentUser();
      if (!user) return;
      await store.periodService.unlock(period, user);
      store.periodsResource.reload();
    },
    async create(year: number, month = 0): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.appStore.tenantId();
      const accountingTenantId = store.accountingStore.accountingTenantId();
      const period = new PeriodModel(tenantId, accountingTenantId, year, month);
      await store.periodService.create(period, store.currentUser());
      store.periodsResource.reload();
    },
  }))
);
