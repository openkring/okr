import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ActionSheetController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { DocGenerationService } from '@okr/content-pdf-template-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { costCenterLabel, costCenterSubtreeKeys, sortCostCenterTree } from '@okr/finance-cost-center-util';
import { ReportingService } from '@okr/finance-reporting-data-access';
import {
  AccountBookingRow, ALL_COST_CENTERS, bookingsByAccount, buildReportDocument, buildReportRows, defaultExpandedKeys, downloadCsv, downloadFromUrl, fiscalYear, fiscalYearOf, effectiveCostCenterSelection, filterLinesByCostCenter, NO_COST_CENTER, printableRows, REPORTING_I18N_KEYS,
  ReportDocumentLabels, ReportingI18n, ReportRow, reportToCsv, ReportVariant, sumLinesByAccount, totalForClasses, yearResult,
} from '@okr/finance-reporting-util';
import { AddressService } from '@okr/subject-address-data-access';

import { loadOrgAddressLine } from './reporting-address';

export type ReportKind = 'balance' | 'income';

type ReportingState = {
  selectedYear: number;                 // fiscal year; 0 = the current one
  searchTerm: string;
  showZero: boolean;
  selectedCostCenterKey: string;        // Erfolgsrechnung filter: '' = all, NO_COST_CENTER = bucket, else a Kostenstelle okey
  userExpandedKeys: string[] | undefined;
};

/**
 * Bilanz + Erfolgsrechnung of the accounting tenant (accounting design Phase 5). Everything is
 * aggregated client-side from the posted bookings and their lines — the same data the journal
 * already streams — so the pages react live to new postings. Amounts are minor units.
 */
export const ReportingStore = signalStore(
  withState<ReportingState>({ selectedYear: 0, searchTerm: '', showZero: false, selectedCostCenterKey: ALL_COST_CENTERS, userExpandedKeys: undefined }),
  withProps(() => ({
    accountService: inject(AccountService),
    reportingService: inject(ReportingService),
    accountingStore: inject(AccountingStore),
    costCenterStore: inject(CostCenterStore),
    appStore: inject(AppStore),
    addressService: inject(AddressService),
    docGenerationService: inject(DocGenerationService),
    alertService: inject(AlertService),
    actionSheetController: inject(ActionSheetController),
    i18nService: inject(I18nService),
    router: inject(Router),
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
    functionalCurrency: computed(() => store.accountingStore.config()?.functionalCurrency ?? 'CHF'),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withComputed(store => ({
    /**
     * The org whose letterhead the statements carry — NOT `accountingTenantId`.
     *
     * `accountingTenantId` is the BOOKS' key. For a sub-entity's books it happens to be a real
     * `orgs` okey, but for the tenant's own default books it is the tenant id, and that is only
     * also an org okey where the tenant's org doc was keyed that way (scs). Where it was not
     * (bkg → `orgs/DIVsVOA0fXfrLDLY3m5y`), `getOrg('bkg')` misses and the header falls back to
     * the raw tenant id. The tenant's own org is `app-config.ownerOrgId`.
     */
    reportOrgKey: computed(() => {
      const accountingTenantId = store.accountingTenantId();
      return accountingTenantId === store.appStore.tenantId()
        ? store.appStore.appConfig().ownerOrgId || accountingTenantId
        : accountingTenantId;
    }),
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
    /** Filter choices: all, every Kostenstelle (tree order, indented, archived included), the bucket. */
    costCenterOptions: computed<string[]>(() => [
      ALL_COST_CENTERS, ...sortCostCenterTree(store.costCenterStore.costCenters()).map(n => n.center.okey), NO_COST_CENTER]),
    /** The filter is offered only on the native ledger and once at least one Kostenstelle exists. */
    showCostCenterFilter: computed(() => store.costCenterStore.isEnabled() && store.costCenterStore.costCenters().length > 0),
  })),
  withComputed(store => ({
    /** The selection that actually filters: all when the filter is off or the stored key is not an option. */
    effectiveCostCenterKey: computed(() => effectiveCostCenterSelection(store.selectedCostCenterKey(), store.showCostCenterFilter(), store.costCenterOptions())),
  })),
  withComputed(store => ({
    // Bilanz: cumulative up to the year end. Erfolgsrechnung: within the year.
    balanceCurrent: computed(() => sumLinesByAccount(store.lines(), store.bookings(), '', store.currentFy().to)),
    balancePrevious: computed(() => sumLinesByAccount(store.lines(), store.bookings(), '', store.previousFy().to)),
    // The Bilanz Jahresergebnis is always the unfiltered result — the Kostenstelle filter is ER-only.
    unfilteredIncomeCurrent: computed(() => sumLinesByAccount(store.lines(), store.bookings(), store.currentFy().from, store.currentFy().to)),
    unfilteredIncomePrevious: computed(() => sumLinesByAccount(store.lines(), store.bookings(), store.previousFy().from, store.previousFy().to)),
    /** The Erfolgsrechnung lines: filtered by the selected Kostenstelle subtree (all / bucket / subtree). */
    incomeLines: computed(() => filterLinesByCostCenter(
      store.lines(), store.effectiveCostCenterKey(), costCenterSubtreeKeys(store.costCenterStore.costCenters(), store.effectiveCostCenterKey()))),
  })),
  withComputed(store => ({
    incomeCurrent: computed(() => sumLinesByAccount(store.incomeLines(), store.bookings(), store.currentFy().from, store.currentFy().to)),
    incomePrevious: computed(() => sumLinesByAccount(store.incomeLines(), store.bookings(), store.previousFy().from, store.previousFy().to)),
    /** account okey → its posted bookings of the selected fiscal year (Kostenstelle filter applied), signed like the row */
    incomeDetails: computed<Map<string, AccountBookingRow[]>>(() => {
      const { from, to } = store.currentFy();
      return bookingsByAccount(store.incomeLines(), store.bookings().filter(b => b.date >= from && b.date <= to), store.accounts());
    }),
    balanceResultCurrent: computed(() => yearResult(store.accounts(), store.unfilteredIncomeCurrent())),
    balanceResultPrevious: computed(() => yearResult(store.accounts(), store.unfilteredIncomePrevious())),
  })),
  withComputed(store => ({
    resultCurrent: computed(() => yearResult(store.accounts(), store.incomeCurrent())),
    resultPrevious: computed(() => yearResult(store.accounts(), store.incomePrevious())),
    costCenterOptionLabels: computed<string[]>(() => [
      store.i18n.all_cost_centers(),
      ...sortCostCenterTree(store.costCenterStore.costCenters()).map(n => '\u00A0\u00A0'.repeat(n.depth) + costCenterLabel(n.center)),
      store.i18n.no_cost_center()]),
    /** Label of the active filter, '' when none is set (appended to the PDF title). */
    costCenterFilterLabel: computed(() => {
      const key = store.effectiveCostCenterKey();
      if (key === ALL_COST_CENTERS) return '';
      if (key === NO_COST_CENTER) return store.i18n.no_cost_center();
      const center = store.costCenterStore.costCenters().find(c => c.okey === key);
      return center ? costCenterLabel(center) : '';
    }),
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
  withMethods(store => ({
    /**
     * The rows of one statement. `applySearch` is false for the PDF: a document titled
     * «Definitive Bilanz» that silently omitted the accounts somebody had searched away on screen
     * would not be a statement. The expand/collapse state and the Nullzeilen toggle are kept
     * either way, so the printed tree is the one on the page.
     */
    reportRows(kind: ReportKind, applySearch: boolean): ReportRow[] {
      const accounts = store.accounts();
      const expanded = store.expandedKeys(), showZero = store.showZero();
      // Bilanz: the unfiltered Jahresergebnis; Erfolgsrechnung: the filtered one.
      const result = kind === 'balance'
        ? { current: store.balanceResultCurrent(), previous: store.balanceResultPrevious() }
        : { current: store.resultCurrent(), previous: store.resultPrevious() };
      const resultName = result.current < 0 ? store.i18n.year_loss() : store.i18n.year_profit();
      const keep = (rows: ReportRow[]): ReportRow[] => applySearch ? rows.filter(r => store.matchesSearch(r)) : rows;

      /**
       * The computed Jahresergebnis line, or nothing once the Abschlussbuchung has been posted.
       *
       * That entry books the result out of the Erfolgskonten onto the Eigenkapital
       * (9200 an 2979), and 9200 is in the `result` class `yearResult` sums — so for a closed
       * year the computed result is 0 while the real number stands on 2979 in the Bilanz and on
       * 9200 in der Erfolgsrechnung. Printing it again would be a second, empty Jahresgewinn
       * line. While the year is still open the line is the only place the result appears, and
       * the Bilanz does not balance without it — hence "hide when zero", not "never show".
       * `showZero` brings it back with the other zero rows.
       */
      const resultRow = (): ReportRow[] =>
        result.current === 0 && result.previous === 0 && !showZero
          ? []
          : [store.syntheticRow('year-result', 'result', resultName, result.current, result.previous)];

      if (kind === 'balance') {
        const cur = store.balanceCurrent(), prev = store.balancePrevious();
        const assets = buildReportRows(accounts, ['assets'], cur, prev, expanded, showZero);
        const liabilities = buildReportRows(accounts, ['liabilities'], cur, prev, expanded, showZero);
        const liabTotal = { current: totalForClasses(accounts, ['liabilities'], cur) + result.current, previous: totalForClasses(accounts, ['liabilities'], prev) + result.previous };
        return [
          ...keep(assets),
          store.syntheticRow('total-assets', 'total', store.i18n.total_assets(), totalForClasses(accounts, ['assets'], cur), totalForClasses(accounts, ['assets'], prev)),
          ...keep(liabilities),
          ...resultRow(),
          store.syntheticRow('total-liabilities', 'total', store.i18n.total_liabilities(), liabTotal.current, liabTotal.previous),
        ];
      }

      const cur = store.incomeCurrent(), prev = store.incomePrevious();
      const revenue = buildReportRows(accounts, ['revenue'], cur, prev, expanded, showZero);
      const expense = buildReportRows(accounts, ['expense'], cur, prev, expanded, showZero);
      const other = buildReportRows(accounts, ['result'], cur, prev, expanded, showZero);
      return [
        ...keep(revenue),
        store.syntheticRow('total-revenue', 'total', store.i18n.total_revenue(), totalForClasses(accounts, ['revenue'], cur), totalForClasses(accounts, ['revenue'], prev)),
        ...keep(expense),
        store.syntheticRow('total-expense', 'total', store.i18n.total_expense(), totalForClasses(accounts, ['expense'], cur), totalForClasses(accounts, ['expense'], prev)),
        ...keep(other),
        ...resultRow(),
      ];
    },
  })),
  withComputed(store => ({
    balanceRows: computed<ReportRow[]>(() => store.reportRows('balance', true)),
    incomeRows: computed<ReportRow[]>(() => store.reportRows('income', true)),
  })),
  withMethods(store => ({
    setAccountingTenant(id: string): void {
      if (id !== store.accountingTenantId()) patchState(store, { selectedCostCenterKey: ALL_COST_CENTERS });
      store.accountingStore.setTenant(id);
    },
    setSelectedYear(year: number): void {
      if (year > 1900 && year < 3000) patchState(store, { selectedYear: year });   // ignore the "all years" sentinel
    },
    setSearchTerm(searchTerm: string): void { patchState(store, { searchTerm }); },
    setSelectedCostCenterKey(selectedCostCenterKey: string): void { patchState(store, { selectedCostCenterKey }); },
    toggleZero(): void { patchState(store, { showZero: !store.showZero() }); },
    toggleExpand(okey: string): void {
      const current = store.expandedKeys();
      patchState(store, { userExpandedKeys: current.includes(okey) ? current.filter(k => k !== okey) : [...current, okey] });
    },
    rows(kind: ReportKind): ReportRow[] {
      return kind === 'balance' ? store.balanceRows() : store.incomeRows();
    },
    /** Open the journal filtered by the tapped account and the selected fiscal year (as the Kontoplan does). */
    async showAccount(accountKey: string): Promise<void> {
      if (!accountKey) return;
      await store.router.navigate(
        ['/accounting', store.accountingTenantId(), 'journal', 'c-journal'],
        { queryParams: { accountKey, year: store.year() } });
    },
    async exportCsv(kind: ReportKind): Promise<void> {
      const header = [store.i18n.col_account(), store.i18n.col_name(), store.currentFy().label, store.previousFy().label];
      const name = kind === 'balance' ? 'bilanz' : 'erfolgsrechnung';
      const filterLabel = kind === 'income' ? store.costCenterFilterLabel() : '';
      if (filterLabel) header[1] = `${header[1]} – ${filterLabel}`;
      downloadCsv(reportToCsv(this.rows(kind), header), `${name}-${store.accountingTenantId()}-${store.currentFy().label.replace('/', '-')}.csv`);
      await store.alertService.showToast(store.i18n.export_conf());
    },

    /**
     * Asks whether the statement is the definitive or a provisional one. The answer is
     * presentational only — it decides the title, the filename and the watermark. Nothing is
     * frozen; a real Jahresabschluss that closes the booking period comes later.
     */
    async askVariant(): Promise<ReportVariant | undefined> {
      const sheet = await store.actionSheetController.create({
        header: store.i18n.pdf_sheet(),
        buttons: [
          { text: store.i18n.pdf_final(), data: { variant: 'final' } },
          { text: store.i18n.pdf_provisional(), data: { variant: 'provisional' } },
          { text: store.i18n.pdf_cancel(), role: 'cancel' },
        ],
      });
      await sheet.present();
      const { data } = await sheet.onDidDismiss();
      return data?.variant as ReportVariant | undefined;
    },

    /** The org's own postal address as one line, or '' when it has none / cannot be read. */
    async orgAddressLine(): Promise<string> {
      return loadOrgAddressLine(store.addressService, store.reportOrgKey());
    },

    /**
     * Renders the statement as it stands on the page into a PDF, through the existing
     * `generateDocument` Cloud Function (puppeteer HTML→PDF), and opens it in a new tab.
     * @param openKeys Erfolgsrechnung accounts opened on the page — the PDF lists their bookings too
     */
    async exportPdf(kind: ReportKind, openKeys: ReadonlySet<string> = new Set()): Promise<void> {
      const variant = await this.askVariant();
      if (!variant) return;
      try {
        const fy = store.currentFy();
        const view = (date: string): string => convertDateFormatToString(date, DateFormat.StoreDate, DateFormat.ViewDate, false);
        const prefix = variant === 'final' ? store.i18n.pdf_prefix_final() : store.i18n.pdf_prefix_prov();
        const filterLabel = store.costCenterFilterLabel();
        const title = kind === 'balance'
          ? fill(store.i18n.pdf_title_balance(), { prefix, date: view(fy.to) })
          : fill(store.i18n.pdf_title_income(), { prefix, period: fy.label }) + (filterLabel ? ` – ${filterLabel}` : '');

        const labels: ReportDocumentLabels = {
          title,
          created: store.i18n.pdf_created(),
          address: store.i18n.pdf_address(),
          period: store.i18n.pdf_period(),
          periodValue: fill(store.i18n.pdf_period_value(), { from: view(fy.from), to: view(fy.to) }),
          amounts: fill(store.i18n.pdf_amounts(), { currency: store.functionalCurrency() }),
          watermark: store.i18n.pdf_watermark(),
          colAccount: store.i18n.col_account(),
          colName: store.i18n.col_name(),
          colCurrent: fy.label,
          colPrevious: store.previousFy().label,
        };
        const rows = kind === 'income'
          ? printableRows(store.reportRows(kind, false), store.incomeDetails(), openKeys, view)
          : store.reportRows(kind, false);
        const html = buildReportDocument(rows, {
          variant,
          orgName: store.appStore.getOrg(store.reportOrgKey())?.name ?? store.accountingTenantId(),
          orgAddress: await this.orgAddressLine(),
          generatedOn: view(getTodayStr(DateFormat.StoreDate)),
          labels,
        });

        const name = kind === 'balance' ? 'bilanz' : 'erfolgsrechnung';
        const filename = `${name}-${variant === 'final' ? 'definitiv' : 'provisorisch'}-${store.accountingTenantId()}-${fy.label.replace('/', '-')}.pdf`;
        const result = await store.docGenerationService.printHtml(html, filename, 'accounting-report', store.accountingTenantId());
        // The PDF lives in Storage behind a signed URL; pull it into the Downloads folder rather
        // than opening a tab, which the browser blocks this long after the menu dismissed.
        const saved = await downloadFromUrl(result.url, filename);
        if (!saved) window.open(result.url, '_blank');
        await store.alertService.showToast(fill(store.i18n.pdf_conf(), { filename }));
      } catch (error) {
        store.alertService.error(`ReportingStore.exportPdf: ${error}`);
      }
    },
  })),
);
