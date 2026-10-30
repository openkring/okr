import { computed, effect, inject, Injector, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { FirestoreService } from '@okr/shared-data-access';
import { BillCollection, BillModel, BookingCollection, BookingLineModel, BookingModel, InvoiceCollection, InvoiceModel, OrgModelName, PersonModelName } from '@okr/shared-models';
import { getSystemQuery, getTodayStr, getYear } from '@okr/shared-util-core';
import { exportCsv, resourceParams } from '@okr/shared-util-angular';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { paymentLabelText } from '@okr/finance-accounting-util';
import { CostCenterStore } from '@okr/finance-cost-center-feature';
import { ProjectService } from '@okr/project-project-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { VatCodeService } from '@okr/finance-vat-code-data-access';
import { BookingLineService, BookingPage, BookingService, ReviewBookingLine } from '@okr/finance-booking-data-access';
import { fiscalYear, fiscalYearOf } from '@okr/finance-reporting-util';
import { PeriodService } from '@okr/finance-period-data-access';
import { invoiceBookingKeys, invoiceVoucherKeys } from '@okr/finance-invoice-util';
import { billBookingKeys, billVoucherKeys } from '@okr/finance-bill-util';
import {
  BOOKING_ACTIONS,
  BookingAction,
  BOOKING_I18N_KEYS,
  BookingI18n,
  bookingStatusCategory,
  bookingMonth,
  bookingYear,
  buildReceiptPayload,
  canReviewBooking,
  collectReceiptPayments,
  bookingWriteErrorReason,
  copyBooking,
  JournalRow,
  journalLoadRange,
  journalYearOptions,
  needsOpeningBalance,
  openingBalance,
  saldoStart,
  formatMinorAmount,
  journalToRows,
  matchActions,
  matchesJournalSearch,
  monthGroupKey,
  monthGroupLabel,
  ReceiptParty,
  runningSaldoByBooking,
  toAccountJournalRows,
  toJournalRow,
} from '@okr/finance-booking-util';
import { PersonService } from '@okr/subject-person-data-access';
import { OrgService } from '@okr/subject-org-data-access';
import { AddressService } from '@okr/subject-address-data-access';
import { getDirectoryPostalAddress, readsAddressVault } from '@okr/subject-address-util';
import { DocGenerationService } from '@okr/content-pdf-template-data-access';

import { BookingEditModal } from './booking-edit.modal';

export type { BookingI18n };

const ALL_YEARS = 99;   // sentinel emitted by okr-year-select for "all years"

/** The opening balance of the running saldo, for the account / period / range it was computed for. */
export interface Opening { key: string; value: number }

/** The loaded part of the journal's period (spec 1.102): bookings and their lines, page by page. */
export interface PeriodState {
  periodBookings: BookingModel[];
  periodLines: BookingLineModel[];
  periodLoading: boolean;
  periodComplete: boolean;
  periodFailed: boolean;
  reviewCount: number | undefined;
  opening: Opening | undefined;
}

export const BookingStore = signalStore(
  // showSaldo / groupByMonth are the two journal context-menu toggles (`toggleSaldo`,
  // `toggleMonthGroups`): a running balance column, and month dividers between the rows.
  withState({ searchTerm: '', selectedYear: getYear(), selectedStatus: 'all', accountKey: '', selectedMonth: 0, showSaldo: false, groupByMonth: false }),
  withState<PeriodState>({
    periodBookings: [], periodLines: [], periodLoading: false, periodComplete: false, periodFailed: false,
    reviewCount: undefined, opening: undefined,
  }),
  withProps(() => ({
    bookingService: inject(BookingService),
    bookingLineService: inject(BookingLineService),
    periodService: inject(PeriodService),
    accountingStore: inject(AccountingStore),
    costCenterStore: inject(CostCenterStore),
    projectService: inject(ProjectService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    i18nService: inject(I18nService),
    accountService: inject(AccountService),
    personService: inject(PersonService),
    orgService: inject(OrgService),
    addressService: inject(AddressService),
    docGenerationService: inject(DocGenerationService),
    toastController: inject(ToastController),
    injector: inject(Injector),
    router: inject(Router),
    vatCodeService: inject(VatCodeService),
    firestoreService: inject(FirestoreService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BOOKING_I18N_KEYS),
    // all projects incl. archived: the picker offers only active ones but still names an archived selected one
    projectsResource: rxResource({
      stream: () => store.projectService.listAll(),
    }),
    accountsResource: rxResource({
      stream: () => store.accountService.list(store.accountingStore.accountingTenantId(), 'id', 'asc'),
    }),
    vatCodesResource: rxResource({
      stream: () => store.vatCodeService.list(store.accountingStore.accountingTenantId()),
    }),
    periodsResource: rxResource({
      stream: () => store.periodService.list(store.accountingStore.accountingTenantId()),
    }),
    // the books' invoices and bills, for "Rechnung anzeigen" — the same queries the invoice/bill lists run
    invoicesResource: rxResource({
      stream: () => store.firestoreService.searchData<InvoiceModel>(InvoiceCollection, [
        ...getSystemQuery(store.appStore.tenantId()),
        { key: 'accountingTenantId', operator: '==' as const, value: store.accountingStore.accountingTenantId() },
      ], 'invoiceDate', 'desc'),
    }),
    billsResource: rxResource({
      stream: () => store.firestoreService.searchData<BillModel>(BillCollection, [
        ...getSystemQuery(store.appStore.tenantId()),
        { key: 'accountingTenantId', operator: '==' as const, value: store.accountingStore.accountingTenantId() },
      ], 'billDate', 'desc'),
    }),
  })),
  withComputed(store => ({
    // The journal holds ONE period (the selected year, or one month of it), loaded page by page
    // (spec 1.102) — never the whole ledger. The list spins only until the first page is in.
    bookings: computed(() => store.periodBookings()),
    isLoading: computed(() => store.periodLoading() && store.periodBookings().length === 0),
    /** later pages of the period are still coming in — filters and search see only part of it */
    isLoadingMore: computed(() => store.periodLoading() && store.periodBookings().length > 0),
    /** the dates loaded: the selected calendar year, one month of it, or everything («Alle Jahre») */
    loadRange: computed(() => journalLoadRange(store.selectedYear(), store.selectedMonth())),
    currentUser: computed(() => store.appStore.currentUser()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    /** okeys of the locked periods — the writeBooking/reviewBooking CFs refuse changes in them. */
    lockedPeriodKeys: computed(() => new Set((store.periodsResource.value() ?? []).filter(p => p.isLocked).map(p => p.okey))),
    tenantId: computed(() => store.appStore.tenantId()),
    // "<id> <name>" of the account the journal is filtered on, '' when unfiltered.
    accountLabel: computed(() => {
      const account = (store.accountsResource.value() ?? []).find(a => a.okey === store.accountKey());
      return account ? `${account.id} ${account.name}` : '';
    }),
    // The saldo column is shown only while it can say something: the toggle is on AND one account is selected.
    saldoVisible: computed(() => store.showSaldo() && !!store.accountKey()),
    // "mm.yyyy" of the month the journal is narrowed to, '' when the whole year is shown.
    monthLabel: computed(() => {
      const month = store.selectedMonth();
      return month > 0 ? `${String(month).padStart(2, '0')}.${store.selectedYear()}` : '';
    }),
    /**
     * The invoice or bill a booking belongs to, by booking okey: the reverse of the documents' own
     * links (issue, payment, reminder and storno bookings; migrated bexio rows in `bookingKeys`).
     */
    documentByBookingKey: computed(() => {
      const map = new Map<string, { kind: 'invoice' | 'bill'; key: string }>();
      for (const invoice of store.invoicesResource.value() ?? []) {
        for (const key of invoiceBookingKeys(invoice)) map.set(key, { kind: 'invoice', key: invoice.okey });
      }
      for (const bill of store.billsResource.value() ?? []) {
        for (const key of billBookingKeys(bill)) if (!map.has(key)) map.set(key, { kind: 'bill', key: bill.okey });
      }
      return map;
    }),
    /**
     * The Belege a booking inherits from its invoice or bill (the invoice/reminder PDFs, the bill's
     * vouchers), by booking okey — same first-claim rule as documentByBookingKey.
     */
    linkedVoucherKeysByBookingKey: computed(() => {
      const map = new Map<string, string[]>();
      for (const invoice of store.invoicesResource.value() ?? []) {
        const keys = invoiceVoucherKeys(invoice);
        if (keys.length > 0) for (const key of invoiceBookingKeys(invoice)) map.set(key, keys);
      }
      for (const bill of store.billsResource.value() ?? []) {
        const keys = billVoucherKeys(bill);
        if (keys.length > 0) for (const key of billBookingKeys(bill)) if (!map.has(key)) map.set(key, keys);
      }
      return map;
    }),
    accountIdByKey: computed(() => {
      const map = new Map<string, string>();
      for (const a of store.accountsResource.value() ?? []) map.set(a.okey, a.id);
      return map;
    }),
    accountNameByKey: computed(() => {
      const map = new Map<string, string>();
      for (const a of store.accountsResource.value() ?? []) map.set(a.okey, a.name);
      return map;
    }),
    locale: computed(() => store.appStore.appConfig()?.locale || 'de-ch'),
    linesByBooking: computed(() => {
      const map = new Map<string, BookingLineModel[]>();
      for (const line of store.periodLines()) {
        const arr = map.get(line.bookingKey) ?? [];
        arr.push(line);
        map.set(line.bookingKey, arr);
      }
      return map;
    }),
  })),
  withComputed(store => ({
    // Flattened journal rows for display, newest booking first. Filtered on an account, only bookings
    // with a line there remain, and a split booking shows just its lines on that account.
    journalRows: computed<JournalRow[]>(() => {
      const accountIdByKey = store.accountIdByKey();
      const accountNameByKey = store.accountNameByKey();
      const linesByBooking = store.linesByBooking();
      const accountKey = store.accountKey();
      // bexio's "Zahlungseingang" / "Zahlungsausgang" shown as the configured labels (GS / BA) — display only
      const config = store.accountingStore.config();
      const labelled = (r: JournalRow): JournalRow => ({
        ...r, accountName: paymentLabelText(r.accountName, config), parts: r.parts.map(p => ({ ...p, text: paymentLabelText(p.text, config) })),
      });
      return store.bookings()
        .flatMap(b => accountKey
          ? toAccountJournalRows(b, linesByBooking.get(b.okey) ?? [], accountKey, accountIdByKey, accountNameByKey)
          : [toJournalRow(b, linesByBooking.get(b.okey) ?? [], accountIdByKey, accountNameByKey)])
        .map(labelled)
        .sort((a, b) => (b.booking.date ?? '').localeCompare(a.booking.date ?? '') || b.booking.bookingNo - a.booking.bookingNo);
    }),
    // The year picker: every fiscal year with a period, plus the current one — not derived from the
    // bookings, which hold only the loaded period.
    years: computed<number[]>(() => journalYearOptions((store.periodsResource.value() ?? []).map(p => p.year), getYear())),
  })),
  withComputed(store => ({
    // journalRows narrowed by the selected year, status and the free-text search term.
    filteredRows: computed<JournalRow[]>(() => {
      const year = store.selectedYear();
      const term = store.searchTerm();
      const status = store.selectedStatus();
      const month = store.selectedMonth();
      return store.journalRows()
        .filter(r => year === ALL_YEARS || r.year === year)
        .filter(r => month === 0 || bookingMonth(r.booking) === month)
        .filter(r => status === 'all' || r.booking.status === status)
        .filter(r => matchesJournalSearch(r, term));
    }),
    // Bookings awaiting a treasurer decision — drives the header badge (all years: a count query).
    forReviewCount: computed<number>(() => store.reviewCount() ?? 0),
    // Status filter options for okr-list-filter, built from the BookingStatus union.
    statusCategory: computed(() => bookingStatusCategory(store.tenantId())),
    // First day of the selected fiscal year (StoreDate), '' while "all years" is selected. It is
    // where the running saldo of an Erfolgsrechnungskonto restarts; balance-sheet accounts ignore it.
    periodFrom: computed<string>(() => {
      const year = store.selectedYear();
      if (year === ALL_YEARS) return '';
      return fiscalYear(year, store.accountingStore.config()?.fiscalYearStart ?? 1).from;
    }),
  })),
  withComputed(store => ({
    // The opening balance the saldo needs ('' = none): a balance-sheet account, or a P&L account
    // viewed one month at a time, has history before the loaded range (spec 1.102 §3.4).
    openingKey: computed<string>(() => {
      const accountKey = store.accountKey();
      const accountId = store.accountIdByKey().get(accountKey) ?? '';
      if (!store.saldoVisible() || !accountId) return '';
      const rangeFrom = store.loadRange().from;
      if (!needsOpeningBalance(accountId, store.periodFrom(), rangeFrom)) return '';
      return [store.accountingTenantId(), accountKey, store.periodFrom(), rangeFrom].join('|');
    }),
  })),
  withComputed(store => ({
    // "Saldo anzeigen": running balance of the filtered account after each posted booking, keyed by
    // booking okey. Empty while no account is selected — a balance needs exactly one account — and
    // while a needed opening balance is still loading (the column shows dashes, never a wrong number).
    saldoByBooking: computed<Map<string, number>>(() => {
      const key = store.openingKey();
      const opening = store.opening();
      if (key && opening?.key !== key) return new Map<string, number>();
      return runningSaldoByBooking(
        store.bookings(),
        store.linesByBooking(),
        store.accountKey(),
        store.accountIdByKey().get(store.accountKey()) ?? '',
        store.periodFrom(),
        key ? opening?.value ?? 0 : 0,
      );
    }),
  })),
  withMethods(store => {
    // a newer load supersedes an older one (year/month/books changed while pages were coming in)
    let periodGeneration = 0;
    let openingGeneration = 0;

    /** Reads one booking range page by page (bookings, then their lines); `onPage` sees each page. */
    async function readPages(books: string, from: string, to: string, onPage: (page: BookingPage, lines: BookingLineModel[]) => boolean): Promise<void> {
      let cursor: BookingPage['cursor'];
      do {
        const page = await store.bookingService.listPage(books, from, to, cursor);
        const lines = await store.bookingLineService.listForBookings(books, page.bookings.map(b => b.okey));
        if (!onPage(page, lines)) return;
        cursor = page.cursor;
      } while (cursor);
    }

    return {
    /**
     * (Re)loads the selected period (spec 1.102): the first page renders at once, the rest follows in
     * the background until the period is complete. One-shot reads — the journal is not a live
     * listener; its own writes patch the affected booking (`refreshBooking`), the rest shows on reload.
     */
    async loadPeriod(): Promise<void> {
      const books = store.accountingTenantId();
      const range = store.loadRange();
      const generation = ++periodGeneration;
      patchState(store, { periodBookings: [], periodLines: [], periodLoading: !!books, periodComplete: false, periodFailed: false });
      if (!books) return;
      try {
        await readPages(books, range.from, range.to, (page, lines) => {
          if (generation !== periodGeneration) return false;
          patchState(store, state => ({
            periodBookings: [...state.periodBookings, ...page.bookings],
            periodLines: [...state.periodLines, ...lines],
          }));
          return true;
        });
        if (generation === periodGeneration) patchState(store, { periodComplete: true });
      } catch (error) {
        console.warn('BookingStore.loadPeriod failed:', error);
        if (generation === periodGeneration) patchState(store, { periodFailed: true });
      } finally {
        if (generation === periodGeneration) patchState(store, { periodLoading: false });
      }
      await this.loadReviewCount();
    },

    /** Pull-to-refresh and after imports: the period again, from the server. */
    async reload(): Promise<void> {
      await this.loadPeriod();
    },

    async loadReviewCount(): Promise<void> {
      const books = store.accountingTenantId();
      patchState(store, { reviewCount: books ? await store.bookingService.countForReview(books) : undefined });
    },

    /**
     * After a write through the journal: re-reads that booking and its lines and patches them into the
     * loaded period — or drops them when the booking is gone or now dated outside the period.
     */
    async refreshBooking(bookingKey: string | undefined): Promise<void> {
      const books = store.accountingTenantId();
      if (!bookingKey || !books) { await this.reload(); return; }
      try {
        const [booking, lines] = await Promise.all([
          store.firestoreService.readModelOnce<BookingModel>(BookingCollection, bookingKey),
          store.bookingLineService.listForBookings(books, [bookingKey]),
        ]);
        const { from, to } = store.loadRange();
        const date = booking?.date ?? '';
        const keep = !!booking && booking.isArchived !== true && booking.accountingTenantId === books
          && (!from || date >= from) && (!to || date <= to);
        patchState(store, state => ({
          periodBookings: [
            ...(keep && booking ? [booking] : []),
            ...state.periodBookings.filter(b => b.okey !== bookingKey),
          ],
          periodLines: [
            ...(keep ? lines : []),
            ...state.periodLines.filter(l => l.bookingKey !== bookingKey),
          ],
          // a write moves the saldo history only when it lies before the loaded range — recompute to be safe
          opening: undefined,
        }));
      } catch (error) {
        console.warn('BookingStore.refreshBooking failed, reloading the period:', error);
        await this.reload();
        return;
      }
      // the opening was cleared above and its key did not change, so the effect will not reload it
      await Promise.all([this.loadReviewCount(), this.loadOpening()]);
    },

    /** The opening balance of the running saldo (spec 1.102 §3.4): that account's lines before the range. */
    async loadOpening(): Promise<void> {
      const key = store.openingKey();
      if (!key || store.opening()?.key === key) return;
      const generation = ++openingGeneration;
      const books = store.accountingTenantId();
      const accountKey = store.accountKey();
      const accountId = store.accountIdByKey().get(accountKey) ?? '';
      const periodFrom = store.periodFrom();
      const before = store.loadRange().from;
      try {
        const [lines, bookings] = await Promise.all([
          store.bookingLineService.listForAccount(books, accountKey),
          store.bookingService.listBefore(books, saldoStart(accountId, periodFrom), before),
        ]);
        if (generation !== openingGeneration) return;
        patchState(store, { opening: { key, value: openingBalance(lines, bookings, accountKey, accountId, periodFrom, before) } });
      } catch (error) {
        // the saldo column keeps its dashes; switching the saldo off and on retries
        console.warn('BookingStore.loadOpening failed:', error);
      }
    },

    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },

    setSelectedYear(year: number): void {
      patchState(store, { selectedYear: year });
    },

    setSelectedStatus(selectedStatus: string): void {
      patchState(store, { selectedStatus });
    },

    /** `?month=<1-12>`: narrows the journal to one month of the selected year; 0 = whole year. */
    setSelectedMonth(selectedMonth: number): void {
      patchState(store, { selectedMonth });
    },

    // Dropping the account filter also drops the saldo column: without an account every row would
    // show a dash, and the header would promise a balance the list cannot compute.
    setAccountKey(accountKey: string): void {
      patchState(store, { accountKey, showSaldo: accountKey ? store.showSaldo() : false });
    },

    /**
     * "Saldo anzeigen" (context menu toggle `toggleSaldo`): adds the running balance column.
     * Only meaningful on a journal filtered to one account, so without one it explains itself
     * instead of showing a column of dashes.
     */
    async toggleSaldo(): Promise<void> {
      if (!store.showSaldo() && !store.accountKey()) {
        await this.toast(store.i18n.saldo_needsAccount());
        return;
      }
      patchState(store, { showSaldo: !store.showSaldo() });
    },

    /** "Monatlich gruppieren" (context menu toggle `toggleMonthGroups`): month dividers between rows. */
    toggleMonthGroups(): void {
      patchState(store, { groupByMonth: !store.groupByMonth() });
    },

    /** Saldo after this row (a booking, or one line of a split booking), formatted; '' when it has none (not posted, or no account filter). */
    saldoOf(row: JournalRow): string {
      const saldo = store.saldoByBooking().get(row.okey);
      return saldo === undefined ? '' : formatMinorAmount(saldo);
    },

    /** 'yyyymm' group of a booking, and the divider label that heads it ('Juni 2026'). */
    monthGroupOf(booking: BookingModel): string {
      return monthGroupKey(booking);
    },

    monthGroupLabelOf(key: string): string {
      return monthGroupLabel(key, store.locale());
    },

    /**
     * "bexio-Journal importieren": hands off to the bank-import feature's JournalImportStore
     * (spec 1.60 §12). Loaded on demand so the journal page does not carry the bank-import libs.
     */
    async importBexioJournal(): Promise<void> {
      const { JournalImportStore } = await import('@okr/finance-bank-import-feature');
      await store.injector.get(JournalImportStore).importFile();
      await this.reload();
    },

    /**
     * "Bankauszug importieren": runs the bank-import feature's statement import (ZKB, PostFinance, …;
     * spec 2026-09-14 §6.2) for this accounting tenant, then opens the import list, where the rows are
     * reviewed and posted as bookings. The stores are created on demand in a throwaway injector so the
     * journal page does not carry the bank-import libs.
     */
    async importBankStatement(): Promise<void> {
      const { BANK_IMPORT_PROVIDERS, BankImportStore } = await import('@okr/finance-bank-import-feature');
      const injector = Injector.create({ providers: BANK_IMPORT_PROVIDERS, parent: store.injector });
      try {
        const created = await injector.get(BankImportStore).importFile();
        if (created > 0) await store.router.navigate(['/accounting-bank-import', store.accountingTenantId(), 'bank-import-context']);
      } finally {
        injector.destroy();
      }
    },

    async export(): Promise<void> {
      // an export of a half-loaded period would silently miss bookings
      if (store.periodLoading()) { await this.toast(store.i18n.list_stillLoading()); return; }
      const data = journalToRows(store.filteredRows(), {
        date:   store.i18n.col_date(),
        credit: store.i18n.col_credit(),
        debit:  store.i18n.col_debit(),
        name:   store.i18n.col_name(),
        amount: store.i18n.col_amount(),
      });
      await exportCsv(data, `journal-${getTodayStr()}`);
    },

    /** Everything the edit modal needs beyond the booking: leaf accounts, VAT codes, the locale of the date input. */
    modalProps(booking: BookingModel, lines: BookingLineModel[], readOnly: boolean): Record<string, unknown> {
      return {
        booking, lines, readOnly, currentUser: store.currentUser(),
        // Belege can be added to any saved booking of native books — also a locked or bill one: a Beleg documents the booking, it does not change it
        linkedVoucherKeys: this.linkedVoucherKeysOf(booking), canAddVouchers: !store.isReadOnly() && !!booking.okey,
        accounts: store.accountsResource.value() ?? [], projects: store.projectsResource.value() ?? [], vatCodes: store.vatCodesResource.value() ?? [], locale: store.locale(),
      };
    },

    /** "Soll-/Haben-Konto anzeigen": the journal filtered on that account (the account's ledger view). */
    async showAccount(accountKey: string): Promise<void> {
      if (!accountKey) return;
      await store.router.navigate(['/accounting', store.accountingTenantId(), 'journal', 'c-journal'], { queryParams: { accountKey } });
    },

    /** "Rechnung anzeigen": the invoice or bill list, which opens that document's view modal. */
    async showDocument(booking: BookingModel): Promise<void> {
      const doc = this.documentOf(booking);
      if (!doc) return;
      await store.router.navigate(['/accounting', store.accountingTenantId(), doc.kind, 'all', `c-${doc.kind}`],
        { queryParams: doc.kind === 'invoice' ? { invoiceKey: doc.key } : { billKey: doc.key } });
    },

    /** the Belege of the booking's invoice or bill (not the booking's own `documentKeys`) */
    linkedVoucherKeysOf(booking: BookingModel): string[] {
      return store.linkedVoucherKeysByBookingKey().get(booking.okey) ?? [];
    },

    documentOf(booking: BookingModel): { kind: 'invoice' | 'bill'; key: string } | undefined {
      return store.documentByBookingKey().get(booking.okey);
    },

    /** The month badge's cancel: back to the whole selected year; status, search and account stay as they are. */
    async clearMonthFilter(): Promise<void> {
      patchState(store, { selectedMonth: 0 });
      await store.router.navigate(['/accounting', store.accountingTenantId(), 'journal', 'c-journal'],
        { queryParams: { accountKey: store.accountKey() || null, year: store.selectedYear() } });
    },

    /** The account badge's cancel: back to the unfiltered journal; year, status and search stay as they are. */
    async clearAccountFilter(): Promise<void> {
      patchState(store, { accountKey: '' });
      await store.router.navigate(['/accounting', store.accountingTenantId(), 'journal', 'c-journal']);
    },

    /** "Gegenpartei anzeigen": a person opens its page; an org opens its edit modal read-only. */
    async showCounterparty(booking: BookingModel): Promise<void> {
      const cp = booking.counterparty;
      if (!cp?.key) { await this.toast(store.i18n.as_no_counterparty()); return; }
      if (cp.modelType === 'person') {
        // The header's close button pops AppNavigationService's history, not the browser's:
        // without these entries it fell through to '/' and landed on /public/welcome.
        store.appStore.appNavigationService.resetLinkHistory(store.router.url);
        store.appStore.appNavigationService.pushLink(`/person/${cp.key}`);
        await store.router.navigate(['/person', cp.key]);
        return;
      }
      if (cp.modelType === 'org') {
        const org = await firstValueFrom(store.orgService.read(cp.key).pipe(take(1)));
        if (!org) { await this.toast(store.i18n.action_failed()); return; }
        const { OrgEditModal } = await import('@okr/subject-org-feature');
        const modal = await store.modalController.create({
          component: OrgEditModal,
          componentProps: {
            org,
            currentUser: store.currentUser(),
            tagModel: 'org',
            tenantId: store.tenantId(),
            types: store.appStore.getCategory('org_type'),
            readOnly: true,
          },
        });
        await modal.present();
        await modal.onDidDismiss();
      }
    },

    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.tenantId();
      const accountingTenantId = store.accountingTenantId();
      // bookingNo is assigned by the writeBooking CF inside its transaction (never pre-computed here).
      await this.openEdit(new BookingModel(tenantId, accountingTenantId), [], false);
    },

    /**
     * "Buchung kopieren": opens the create modal pre-filled from `booking`, dated today. The copy is
     * a new, unsaved booking — no key, no booking number, and no Belege or comments (those hang on
     * the original's key). Saving it goes through the normal create path.
     */
    async openCopy(booking: BookingModel, lines: BookingLineModel[]): Promise<void> {
      if (store.isReadOnly()) return;
      // drop copied Kostenstellen that are no longer active leaves — but only once they are loaded,
      // an empty list while loading would strip every key
      const costCenters = store.costCenterStore.isLoading() ? undefined : store.costCenterStore.costCenters();
      const copy = copyBooking(booking, lines, getTodayStr(), costCenters,
        store.projectsResource.isLoading() ? undefined : (store.projectsResource.value() ?? []));
      await this.openEdit(copy.booking, copy.lines, false);
    },

    async openEdit(booking: BookingModel, lines: BookingLineModel[], readOnly = true): Promise<void> {
      // a supplier bill's own booking mirrors the bill (spec 1.85): shown, never edited — writeBooking refuses it
      if ((booking.okey ?? '').startsWith('bill-')) readOnly = true;
      const modal = await store.modalController.create({
        component: BookingEditModal,
        componentProps: this.modalProps(booking, lines, readOnly),
        cssClass: 'wide-modal',
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<{ booking: BookingModel; lines: BookingLineModel[] }>();
      if (role === 'confirm' && data && !store.isReadOnly()) {
        const okey = (data.booking as BookingModel & { okey: string }).okey;
        let writtenKey: string | undefined = okey;
        try {
          if (okey?.length > 0) {
            await store.bookingService.update(data.booking, data.lines, store.currentUser());
          } else {
            writtenKey = await store.bookingService.create(data.booking, data.lines, store.currentUser());
          }
        } catch (error) {
          await this.toastWriteError(error);
        }
        await this.refreshBooking(writtenKey);
      }
    },

    async delete(booking: BookingModel): Promise<void> {
      if (store.isReadOnly()) return;
      try {
        await store.bookingService.delete(booking, store.currentUser());
      } catch (error) {
        await this.toastWriteError(error);
      }
      await this.refreshBooking(booking.okey);
    },

    /*------------------- treasurer review of forReview bookings (spec 1.20) -------------------*/

    /** Whether the approve/correct/reject actions are offered for this booking. */
    canReview(booking: BookingModel): boolean {
      return canReviewBooking(booking, store.currentUser(), store.isReadOnly());
    },

    /** Whether the booking lies in a locked period (annual period of its fiscal year, spec 1.68 D12). */
    isLocked(booking: BookingModel): boolean {
      if (!/^\d{8}$/.test(booking.date ?? '')) return false;
      const year = fiscalYearOf(booking.date, store.accountingStore.config()?.fiscalYearStart ?? 1);
      return store.lockedPeriodKeys().has(`${booking.accountingTenantId}-${year}`);
    },

    /** Toast for a refused ledger write: a locked period gets its own message. */
    async toastWriteError(error: unknown): Promise<void> {
      await this.toast(this.refusalMessage(error) ?? store.i18n.write_failed());
    },

    /** The explained refusals of a ledger callable: a locked period, a Kostenstelle no longer active. */
    refusalMessage(error: unknown): string | undefined {
      switch (bookingWriteErrorReason(error)) {
        case 'period-locked':       return store.i18n.period_locked();
        case 'cost-center-invalid': return store.i18n.write_costCenterInvalid();
        case 'project-invalid':     return store.i18n.write_projectInvalid();
        case 'bill-booking':        return store.i18n.write_billBooking();
        case 'depreciation-booking': return store.i18n.write_depreciationBooking();
        case 'bill-has-payments':   return store.i18n.write_billHasPayments();
        default:                    return undefined;
      }
    },

    /**
     * Approve as proposed. The `bookingNo` comes back from the CF, which assigns it inside its
     * transaction — never pre-compute it here (see BookingService.reviewViaFunction).
     */
    async approve(booking: BookingModel): Promise<void> {
      await this.review({ bookingKey: booking.okey, decision: 'approve' });
    },

    /** Reject with a mandatory reason; the reason is appended to the booking's notes by the CF. */
    async reject(booking: BookingModel): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.review_reason_title(),
        inputs: [{
          name: 'reason', type: 'textarea', attributes: { maxlength: 500 },
          placeholder: store.i18n.review_reason_placeholder(),
        }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.review_reject(), role: 'confirm' },
        ],
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss<{ values: { reason: string } }>();
      const reason = data?.values?.reason?.trim() ?? '';
      if (role !== 'confirm' || reason.length === 0) return;   // cancelled, or no reason given
      await this.review({ bookingKey: booking.okey, decision: 'reject', reason });
    },

    /**
     * Correct, then approve: the OCR guesses the debit account, so the treasurer usually wants to
     * fix something first. The edit modal's confirm cannot write Firestore (bookings are
     * CF-write-only), so its result is sent to the CF as an `approve` with corrections.
     */
    async openReview(booking: BookingModel, lines: BookingLineModel[]): Promise<void> {
      const modal = await store.modalController.create({
        component: BookingEditModal,
        componentProps: this.modalProps(booking, lines, false),
        cssClass: 'wide-modal',
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<{ booking: BookingModel; lines: BookingLineModel[] }>();
      if (role !== 'confirm' || !data) return;
      await this.review({
        bookingKey: booking.okey,
        decision: 'approve',
        corrections: {
          title: data.booking.title,
          date: data.booking.date,
          counterparty: data.booking.counterparty ?? null,
          lines: data.lines.map<ReviewBookingLine>(l => ({
            accountKey: l.accountKey,
            debitAmount:  l.debitAmount  ? { amount: l.debitAmount.amount,  currency: l.debitAmount.currency }  : null,
            creditAmount: l.creditAmount ? { amount: l.creditAmount.amount, currency: l.creditAmount.currency } : null,
            costCenterKey: l.costCenterKey ?? '',
            projectKey: l.projectKey ?? '',
          })),
        },
      });
    },

    /** Single call site for the reviewBooking CF: toasts the outcome and refreshes that booking. */
    async review(payload: Parameters<BookingService['reviewViaFunction']>[0]): Promise<void> {
      try {
        const result = await store.bookingService.reviewViaFunction(payload);
        await this.toast(result.status === 'posted'
          ? `${store.i18n.review_approved()} (${result.bookingNo})`
          : store.i18n.review_rejected());
      } catch (error) {
        await this.toast(this.refusalMessage(error) ?? store.i18n.review_failed());
      }
      // Refresh either way: on failure the local state may still be stale from an earlier attempt.
      await this.refreshBooking(payload.bookingKey);
    },

    availableActions(booking: BookingModel): BookingAction[] {
      const lines = store.linesByBooking().get(booking.okey) ?? [];
      const accountIds = lines
        .map((l) => store.accountIdByKey().get(l.accountKey))
        .filter((id): id is string => !!id);
      return matchActions(booking.accountingTenantId, accountIds, BOOKING_ACTIONS);
    },

    async runAction(action: BookingAction, booking: BookingModel): Promise<void> {
      if (action.type !== 'generateDocument') return;
      if (!booking.counterparty) {
        await this.toast(store.i18n.action_counterpartyRequired());
        return;
      }
      const cp = booking.counterparty;
      // Every payment of this counterparty in the journal's selected year (the booking's own year
      // while "all years" is selected), e.g. Mitgliederbeitrag and Spende on one receipt.
      const year = store.selectedYear() === ALL_YEARS ? bookingYear(booking) : store.selectedYear();
      if (store.periodLoading()) { await this.toast(store.i18n.list_stillLoading()); return; }
      // the receipt covers the whole year: while one month is shown, read the year for it
      let bookings = store.bookings();
      let linesByBooking = store.linesByBooking();
      if (store.selectedMonth() > 0 && store.selectedYear() !== ALL_YEARS) {
        const yearBookings: BookingModel[] = [];
        const yearLines = new Map<string, BookingLineModel[]>();
        const { from, to } = journalLoadRange(year, 0);
        try {
          await readPages(store.accountingTenantId(), from, to, (page, lines) => {
            yearBookings.push(...page.bookings);
            for (const line of lines) yearLines.set(line.bookingKey, [...(yearLines.get(line.bookingKey) ?? []), line]);
            return true;
          });
        } catch {
          await this.toast(store.i18n.action_failed());
          return;
        }
        bookings = yearBookings;
        linesByBooking = yearLines;
      }
      const payments = collectReceiptPayments(
        cp, year, action.trigger.accountIds, bookings, linesByBooking, store.accountIdByKey(), booking.okey,
      );
      if (payments.length === 0) {
        await this.toast(store.i18n.action_failed());
        return;
      }

      // addresses.parentKey is modelType-prefixed ('person.<okey>' / 'org.<okey>'); the bare
      // counterparty key matches no address, so every receipt ended in action_noAddress.
      // Only the owner, privileged and memberAdmin read the raw vault; a treasurer gets the
      // member-visible postal address from the address-directory projection instead.
      const parentKey = `${cp.modelType === 'org' ? OrgModelName : PersonModelName}.${cp.key}`;
      const address = readsAddressVault(store.appStore.currentUser(), parentKey)
        ? await firstValueFrom(store.addressService.getFavoritePostalAddress(parentKey).pipe(take(1)))
        : getDirectoryPostalAddress(store.appStore.getDirectoryEntry(parentKey)?.entries, store.appStore.tenantId(), parentKey);
      if (!address) {
        await this.toast(store.i18n.action_noAddress());
        return;
      }
      let party: ReceiptParty;
      if (cp.modelType === 'org') {
        const org = await firstValueFrom(store.orgService.read(cp.key).pipe(take(1)));
        if (!org) { await this.toast(store.i18n.action_failed()); return; }
        party = { kind: 'org', org };
      } else if (cp.modelType === 'person') {
        const person = await firstValueFrom(store.personService.read(cp.key).pipe(take(1)));
        if (!person) { await this.toast(store.i18n.action_failed()); return; }
        party = { kind: 'person', person };
      } else {
        await this.toast(store.i18n.action_failed());
        return;
      }

      const payload = {
        ...(action.staticPayload ?? {}),
        ...buildReceiptPayload(party, address, payments, year, (accountId) => this.receiptLabel(action, accountId)),
      };

      try {
        const res = await store.docGenerationService.generate({
          templateId: action.templateId,
          payload,
          options: {
            outputFormat: action.outputFormat ?? 'pdf',
            storageMode: 'persist',
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            metadata: { entityType: 'booking', entityId: booking.okey },
          },
        });
        window.open(res.url, '_blank');
      } catch {
        await this.toast(store.i18n.action_failed());
      }
    },

    /** Row label on a receipt: the action's configured label, else the account name. */
    receiptLabel(action: BookingAction, accountId: string): string {
      if (action.type === 'generateDocument' && action.accountLabels?.[accountId]) return action.accountLabels[accountId];
      return (store.accountsResource.value() ?? []).find(a => a.id === accountId)?.name ?? accountId;
    },

    async toast(message: string): Promise<void> {
      const t = await store.toastController.create({ message, duration: 2500 });
      await t.present();
    },
    };
  }),
  withHooks(store => ({
    onInit(): void {
      // the period to load: books, user (auth must be resolved) and date range — value-compared, so an
      // unrelated signal change never restarts the load
      const periodKey = resourceParams(() => ({
        books: store.accountingTenantId(),
        userKey: store.appStore.currentUser()?.okey ?? '',
        range: store.loadRange(),
      }));
      effect(() => {
        const key = periodKey();
        if (!key.userKey) return;
        untracked(() => void store.loadPeriod());
      });
      effect(() => {
        if (!store.openingKey()) return;
        untracked(() => void store.loadOpening());
      });
    },
  }))
);
