import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { PeriodModel } from '@okr/shared-models';
import { AlertService, resourceParams } from '@okr/shared-util-angular';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { BookingService } from '@okr/finance-booking-data-access';
import { ReportingService } from '@okr/finance-reporting-data-access';
import { sumLinesByAccount, yearResult } from '@okr/finance-reporting-util';
import { PeriodService } from '@okr/finance-period-data-access';
import { PERIOD_I18N_KEYS, periodRange } from '@okr/finance-period-util';

/** Per-period figures shown on the list row. `result` is a minor-unit amount (negative = Verlust). */
export interface PeriodStats {
  bookingCount: number;
  result: number;
}

export const PeriodStore = signalStore(
  withState({}),
  withProps(() => ({
    periodService: inject(PeriodService),
    accountService: inject(AccountService),
    bookingService: inject(BookingService),
    reportingService: inject(ReportingService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
    alertService: inject(AlertService),
    router: inject(Router),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PERIOD_I18N_KEYS),
    periodsResource: rxResource({
      stream: () => store.periodService.list(store.accountingStore.accountingTenantId()),
    }),
    // Bookings, lines and accounts of the same books — the per-period booking count and
    // Jahresgewinn are aggregated client-side, exactly as the Erfolgsrechnung does it.
    accountsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.accountService.list(params.id) : of([]),
    }),
    bookingsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.bookingService.list(params.id) : of([]),
    }),
    linesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.reportingService.getAllLines(params.id) : of([]),
    }),
  })),
  withComputed(store => ({
    periods: computed(() => store.periodsResource.value() ?? []),
    isLoading: computed(() => store.periodsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    fiscalYearStart: computed(() => store.accountingStore.config()?.fiscalYearStart ?? 1),
  })),
  withComputed(store => ({
    /**
     * Booking count and Jahresgewinn per period okey. The count covers every booking dated in the
     * period (drafts included — that is what the journal shows); the result counts posted bookings
     * only, because `sumLinesByAccount` skips everything else.
     */
    statsByPeriod: computed<Map<string, PeriodStats>>(() => {
      const bookings = store.bookingsResource.value() ?? [];
      const lines = store.linesResource.value() ?? [];
      const accounts = store.accountsResource.value() ?? [];
      const fiscalYearStart = store.fiscalYearStart();
      const stats = new Map<string, PeriodStats>();
      for (const period of store.periods()) {
        const { from, to } = periodRange(period, fiscalYearStart);
        const bookingCount = bookings.filter(b => (b.date ?? '') >= from && (b.date ?? '') <= to).length;
        const result = yearResult(accounts, sumLinesByAccount(lines, bookings, from, to));
        stats.set(period.okey, { bookingCount, result });
      }
      return stats;
    }),
  })),
  withMethods(store => ({
    /**
     * "Buchungen anzeigen": the journal narrowed to this period — the year always, plus the month
     * for a monthly period (an annual period shows the whole year).
     */
    async showBookings(period: PeriodModel): Promise<void> {
      const queryParams: Record<string, number> = { year: period.year };
      if (period.month > 0) queryParams['month'] = period.month;
      await store.router.navigate(
        ['/accounting', store.accountingStore.accountingTenantId(), 'journal', 'c-journal'],
        { queryParams });
    },

    /** "Bilanz anzeigen" / "ER anzeigen": both reports are per fiscal year — a monthly period opens its year. */
    async showReport(period: PeriodModel, report: 'balance' | 'income-statement'): Promise<void> {
      await store.router.navigate(
        ['/accounting', store.accountingStore.accountingTenantId(), report, 'c-report'],
        { queryParams: { year: period.year } });
    },

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
