import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import {
  buildReportRows, defaultExpandedKeys, downloadCsv, fiscalYear, fiscalYearOf, REPORTING_I18N_KEYS, ReportingI18n, ReportRow,
  reportToCsv, sumLinesByAccount, totalForClasses, yearResult,
} from '@okr/finance-reporting-util';

export type ReportKind = 'balance' | 'income';

type ReportingState = {
  selectedYear: number;                 // fiscal year; 0 = the current one
  searchTerm: string;
  showZero: boolean;
  userExpandedKeys: string[] | undefined;
};

/**
 * Bilanz + Erfolgsrechnung of the accounting tenant (accounting design Phase 5). Everything is
 * aggregated client-side from the posted bookings and their lines — the same data the journal
 * already streams — so the pages react live to new postings. Amounts are minor units.
 */
export const ReportingStore = signalStore(
  withState<ReportingState>({ selectedYear: 0, searchTerm: '', showZero: false, userExpandedKeys: undefined }),
  withProps(() => ({
    accountService: inject(AccountService),
    reportingService: inject(ReportingService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(REPORTING_I18N_KEYS) as ReportingI18n,
    accountsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.accountService.list(params.id) : of([]),
    }),
    bookingsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.reportingService.getJournalEntries(params.id) : of([]),
    }),
    linesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.reportingService.getAllLines(params.id) : of([]),
    }),
  })),
  withComputed(store => ({
    accounts: computed(() => store.accountsResource.value() ?? []),
    bookings: computed(() => store.bookingsResource.value() ?? []),
    lines: computed(() => store.linesResource.value() ?? []),
    isLoading: computed(() => store.accountsResource.isLoading() || store.bookingsResource.isLoading() || store.linesResource.isLoading()),
    fiscalYearStart: computed(() => store.accountingStore.config()?.fiscalYearStart ?? 1),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withComputed(store => ({
    /** Distinct fiscal years with postings (desc), always including the running one. */
    years: computed<number[]>(() => {
      const start = store.fiscalYearStart();
      const set = new Set<number>([fiscalYearOf(getTodayStr(DateFormat.StoreDate), start)]);
      store.bookings().forEach(b => { const y = fiscalYearOf(b.date, start); if (y) set.add(y); });
      return [...set].sort((a, b) => b - a);
    }),
    year: computed(() => store.selectedYear() || fiscalYearOf(getTodayStr(DateFormat.StoreDate), store.fiscalYearStart())),
    expandedKeys: computed(() => store.userExpandedKeys() ?? defaultExpandedKeys(store.accounts())),
  })),
  withComputed(store => ({
    currentFy: computed(() => fiscalYear(store.year(), store.fiscalYearStart())),
    previousFy: computed(() => fiscalYear(store.year() - 1, store.fiscalYearStart())),
  })),
  withComputed(store => ({
    // Bilanz: cumulative up to the year end. Erfolgsrechnung: within the year.
    balanceCurrent: computed(() => sumLinesByAccount(store.lines(), store.bookings(), '', store.currentFy().to)),
    balancePrevious: computed(() => sumLinesByAccount(store.lines(), store.bookings(), '', store.previousFy().to)),
    incomeCurrent: computed(() => sumLinesByAccount(store.lines(), store.bookings(), store.currentFy().from, store.currentFy().to)),
    incomePrevious: computed(() => sumLinesByAccount(store.lines(), store.bookings(), store.previousFy().from, store.previousFy().to)),
  })),
  withComputed(store => ({
    resultCurrent: computed(() => yearResult(store.accounts(), store.incomeCurrent())),
    resultPrevious: computed(() => yearResult(store.accounts(), store.incomePrevious())),
  })),
  withMethods(store => ({
    /** A synthetic total/result row; the name is decided by the sign when `lossName` is given. */
    syntheticRow(okey: string, kind: 'total' | 'result', name: string, current: number, previous: number): ReportRow {
      return { okey, id: '', name, depth: 0, kind, hasChildren: false, isExpanded: false, current, previous };
    },
    matchesSearch(row: ReportRow): boolean {
      const term = store.searchTerm().trim().toLowerCase();
      if (!term || row.kind === 'total' || row.kind === 'result') return true;
      return row.name.toLowerCase().includes(term) || row.id.toLowerCase().includes(term);
    },
  })),
  withComputed(store => ({
    balanceRows: computed<ReportRow[]>(() => {
      const accounts = store.accounts();
      const cur = store.balanceCurrent(), prev = store.balancePrevious();
      const result = { current: store.resultCurrent(), previous: store.resultPrevious() };
      const resultName = result.current < 0 ? store.i18n.year_loss() : store.i18n.year_profit();
      const assets = buildReportRows(accounts, ['assets'], cur, prev, store.expandedKeys(), store.showZero());
      const liabilities = buildReportRows(accounts, ['liabilities'], cur, prev, store.expandedKeys(), store.showZero());
      const liabTotal = { current: totalForClasses(accounts, ['liabilities'], cur) + result.current, previous: totalForClasses(accounts, ['liabilities'], prev) + result.previous };
      return [
        ...assets.filter(r => store.matchesSearch(r)),
        store.syntheticRow('total-assets', 'total', store.i18n.total_assets(), totalForClasses(accounts, ['assets'], cur), totalForClasses(accounts, ['assets'], prev)),
        ...liabilities.filter(r => store.matchesSearch(r)),
        store.syntheticRow('year-result', 'result', resultName, result.current, result.previous),
        store.syntheticRow('total-liabilities', 'total', store.i18n.total_liabilities(), liabTotal.current, liabTotal.previous),
      ];
    }),
    incomeRows: computed<ReportRow[]>(() => {
      const accounts = store.accounts();
      const cur = store.incomeCurrent(), prev = store.incomePrevious();
      const result = { current: store.resultCurrent(), previous: store.resultPrevious() };
      const resultName = result.current < 0 ? store.i18n.year_loss() : store.i18n.year_profit();
      const revenue = buildReportRows(accounts, ['revenue'], cur, prev, store.expandedKeys(), store.showZero());
      const expense = buildReportRows(accounts, ['expense'], cur, prev, store.expandedKeys(), store.showZero());
      const other = buildReportRows(accounts, ['result'], cur, prev, store.expandedKeys(), store.showZero());
      return [
        ...revenue.filter(r => store.matchesSearch(r)),
        store.syntheticRow('total-revenue', 'total', store.i18n.total_revenue(), totalForClasses(accounts, ['revenue'], cur), totalForClasses(accounts, ['revenue'], prev)),
        ...expense.filter(r => store.matchesSearch(r)),
        store.syntheticRow('total-expense', 'total', store.i18n.total_expense(), totalForClasses(accounts, ['expense'], cur), totalForClasses(accounts, ['expense'], prev)),
        ...other.filter(r => store.matchesSearch(r)),
        store.syntheticRow('year-result', 'result', resultName, result.current, result.previous),
      ];
    }),
  })),
  withMethods(store => ({
    setAccountingTenant(id: string): void { store.accountingStore.setTenant(id); },
    setSelectedYear(year: number): void {
      if (year > 1900 && year < 3000) patchState(store, { selectedYear: year });   // ignore the "all years" sentinel
    },
    setSearchTerm(searchTerm: string): void { patchState(store, { searchTerm }); },
    toggleZero(): void { patchState(store, { showZero: !store.showZero() }); },
    toggleExpand(okey: string): void {
      const current = store.expandedKeys();
      patchState(store, { userExpandedKeys: current.includes(okey) ? current.filter(k => k !== okey) : [...current, okey] });
    },
    rows(kind: ReportKind): ReportRow[] {
      return kind === 'balance' ? store.balanceRows() : store.incomeRows();
    },
    async exportCsv(kind: ReportKind): Promise<void> {
      const header = [store.i18n.col_account(), store.i18n.col_name(), store.currentFy().label, store.previousFy().label];
      const name = kind === 'balance' ? 'bilanz' : 'erfolgsrechnung';
      downloadCsv(reportToCsv(this.rows(kind), header), `${name}-${store.accountingTenantId()}-${store.currentFy().label.replace('/', '-')}.csv`);
      await store.alertService.showToast(store.i18n.export_conf());
    },
  })),
);
