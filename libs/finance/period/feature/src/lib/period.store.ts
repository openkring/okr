import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PeriodModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { PeriodService } from '@bk2/finance-period-data-access';
import { PFX } from './scope';

const PERIOD_I18N_KEYS = {
  list_title:    PFX + 'list.title',
  empty:         PFX + 'empty',
  locked_label:  PFX + 'locked.label',
  lock_action:   PFX + 'lock.action',
  unlock_action: PFX + 'unlock.action',
} satisfies Record<string, string>;

export type PeriodI18n = { [K in keyof typeof PERIOD_I18N_KEYS]: Signal<string> };

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
      const user = store.currentUser();
      if (!user) return;
      await store.periodService.lock(period, user);
      store.periodsResource.reload();
    },
    async unlock(period: PeriodModel): Promise<void> {
      const user = store.currentUser();
      if (!user) return;
      await store.periodService.unlock(period, user);
      store.periodsResource.reload();
    },
    async create(year: number, month = 0): Promise<void> {
      const tenantId = store.appStore.tenantId();
      const accountingTenantId = store.accountingStore.accountingTenantId();
      const period = new PeriodModel(tenantId, accountingTenantId, year, month);
      await store.periodService.create(period, store.currentUser());
      store.periodsResource.reload();
    },
  }))
);
