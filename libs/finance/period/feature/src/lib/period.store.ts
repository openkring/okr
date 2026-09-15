import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PeriodModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { PeriodService } from '@okr/finance-period-data-access';
import { PERIOD_I18N_KEYS } from '@okr/finance-period-util';

export const PeriodStore = signalStore(
  withState({}),
  withProps(() => ({
    periodService: inject(PeriodService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
    alertService: inject(AlertService),
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
    /** Context-menu `create`: asks for a year and creates the annual period (monthly ones are created on first booking). */
    async createFromPrompt(): Promise<void> {
      if (store.isReadOnly()) return;
      const proposed = String(new Date().getFullYear());
      const answer = await store.alertService.okrPrompt(store.i18n.create_prompt(), store.i18n.create_placeholder(), proposed);
      if (answer === undefined) return;
      const year = Number(answer.trim());
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        await store.alertService.showToast(store.i18n.create_invalid());
        return;
      }
      if (store.periods().some(p => p.year === year && p.month === 0)) {
        await store.alertService.showToast(store.i18n.create_exists());
        return;
      }
      await this.create(year);
    },
  }))
);
