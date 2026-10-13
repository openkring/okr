import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from, of } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  AccountCollection, AccountModel, BankImportRowCollection, BillCollection, BillModel, BookingCollection, BookingLineCollection, BookingLineModel, BookingModel,
  BudgetLineCollection, BudgetLineModel, BudgetVersionCollection, BudgetVersionModel, DbQuery, ExpenseCollection, ExpenseModel, InvoiceCollection, InvoiceModel,
  PaymentOrderCollection, PaymentOrderModel, PeriodCollection, PeriodModel,
} from '@okr/shared-models';
import { getSystemQuery, getTodayStr } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import { chunk, computeKeyFigures, currentPeriod, fiscalYearOptions, KeyFigures, liquidityBalance, openTotals, OverviewTodos, summarizeTodos } from '@okr/finance-accounting-util';
import { fiscalYear, fiscalYearOf } from '@okr/finance-reporting-util';

import { AccountingStore } from './accounting.store';

/** `bookingKey in [...]`: 15 keys × the 2-value tenant filter = Firestore's 30 disjunctions (see BillService). */
const BOOKING_KEY_CHUNK = 15;
const PARALLEL_READS = 10;

/** One to-do source: a failed read becomes undefined, so its card shows «—» and the others still load (spec 1.100 §4.4). */
function settle<T>(read: Promise<T>, what: string): Promise<T | undefined> {
  return read.catch((err: unknown) => {
    console.warn(`AccountingOverviewStore: ${what} failed:`, err);
    return undefined;
  });
}

/** `resource.value()` throws while the resource is in error state (Angular 22): read it only when it has one. */
function valueOf<T>(res: { hasValue(): boolean; value(): T }): T | undefined {
  return res.hasValue() ? res.value() : undefined;
}

/** Accounting overview (spec 1.100 §4.4): to-dos, then key figures of ONE fiscal year, cash balance on demand. */
export const AccountingOverviewStore = signalStore(
  withState({ selectedYear: 0, balanceValue: undefined as { books: string; value: number } | undefined, balanceLoading: false }),
  withProps(() => ({
    fs: inject(FirestoreService),
    tenantId: inject(ENV).tenantId,
    accountingStore: inject(AccountingStore),
  })),
  withProps(store => ({
    /** tenant + books filter, required on every finance query */
    scope: (books: string): DbQuery[] => [
      ...getSystemQuery(store.tenantId),
      { key: 'accountingTenantId', operator: '==', value: books },
    ],
  })),
  withComputed(store => ({
    books: computed(() => store.accountingStore.accountingTenantId()),
    userKey: computed(() => store.accountingStore.appStore.currentUser()?.okey ?? ''),
    today: computed(() => getTodayStr()),
    fiscalYearStart: computed(() => store.accountingStore.config()?.fiscalYearStart ?? 1),
  })),
  withComputed(store => ({
    currentFiscalYear: computed(() => fiscalYearOf(store.today(), store.fiscalYearStart())),
  })),
  withComputed(store => ({
    year: computed(() => store.selectedYear() || store.currentFiscalYear()),
    yearOptions: computed(() => fiscalYearOptions(store.currentFiscalYear())),
  })),
  withProps(store => {
    const { fs, scope } = store;

    async function loadTodos(books: string, today: string): Promise<OverviewTodos> {
      const q = scope(books);
      const [bookingsForReview, bills, paymentOrders, invoices, expenses, unmapped, mapped, failed] = await Promise.all([
        fs.countOnce(BookingCollection, [...q, { key: 'status', operator: '==', value: 'forReview' }]),
        settle(fs.getDataOnceStrict<BillModel>(BillCollection, q), 'bills'),
        settle(fs.getDataOnceStrict<PaymentOrderModel>(PaymentOrderCollection, q), 'payment orders'),
        settle(fs.getDataOnceStrict<InvoiceModel>(InvoiceCollection, q), 'invoices'),
        settle(fs.getDataOnceStrict<ExpenseModel>(ExpenseCollection, q), 'expenses'),
        fs.countOnce(BankImportRowCollection, [...q, { key: 'status', operator: '==', value: 'unmapped' }]),
        fs.countOnce(BankImportRowCollection, [...q, { key: 'status', operator: '==', value: 'mapped' }]),
        fs.countOnce(BankImportRowCollection, [...q, { key: 'status', operator: '==', value: 'error' }]),
      ]);
      const rows = [unmapped, mapped, failed];
      return {
        ...summarizeTodos({ bills, paymentOrders, invoices, expenses, today }),
        bookingsForReview,
        bankRowsOpen: rows.some(r => r === undefined) ? undefined : rows.reduce((s: number, r) => s + (r ?? 0), 0),
        openTotals: openTotals(bills, invoices, today),
      };
    }

    async function loadFigures(books: string, year: number, start: number): Promise<KeyFigures> {
      const fy = fiscalYear(year, start);
      const q = scope(books);
      const [accounts, bookings, budgetVersions, budgetLines] = await Promise.all([
        fs.getDataOnceStrict<AccountModel>(AccountCollection, q),
        // index: bookings (tenants, accountingTenantId, isArchived, date desc) — exists
        fs.getDataOnceStrict<BookingModel>(BookingCollection, [...q, { key: 'date', operator: '>=', value: fy.from }, { key: 'date', operator: '<=', value: fy.to }], 'date', 'desc'),
        fs.getDataOnceStrict<BudgetVersionModel>(BudgetVersionCollection, q),
        fs.getDataOnceStrict<BudgetLineModel>(BudgetLineCollection, q),
      ]);
      const posted = bookings.filter(b => b.status === 'posted');
      const lines: BookingLineModel[] = [];
      // lines carry no date: read only the lines of this year's posted bookings
      for (const batch of chunk(chunk(posted.map(b => b.okey), BOOKING_KEY_CHUNK), PARALLEL_READS)) {
        const parts = await Promise.all(batch.map(keys =>
          fs.getDataOnceStrict<BookingLineModel>(BookingLineCollection, [...q, { key: 'bookingKey', operator: 'in', value: keys }])));
        lines.push(...parts.flat());
      }
      return computeKeyFigures({ accounts, bookings: posted, lines, from: fy.from, to: fy.to, budgetVersions, budgetLines, fiscalYear: year });
    }

    return {
      todosResource: rxResource({
        params: resourceParams(() => ({ userKey: store.userKey(), books: store.books(), today: store.today() })),
        stream: ({ params }) => params.userKey && params.books ? from(loadTodos(params.books, params.today)) : of(undefined),
      }),
      periodResource: rxResource({
        params: resourceParams(() => ({ userKey: store.userKey(), books: store.books() })),
        stream: ({ params }) => params.userKey && params.books
          ? from(fs.getDataOnceStrict<PeriodModel>(PeriodCollection, scope(params.books)))
          : of([] as PeriodModel[]),
      }),
      figuresResource: rxResource({
        params: resourceParams(() => ({
          userKey: store.userKey(),
          books: store.books(),
          year: store.year(),
          start: store.fiscalYearStart(),
          ready: store.accountingStore.configLoaded(),
        })),
        stream: ({ params }) => params.userKey && params.books && params.ready && params.year
          ? from(loadFigures(params.books, params.year, params.start))
          : of(undefined),
      }),
    };
  }),
  withComputed(store => ({
    todos: computed(() => valueOf(store.todosResource)),
    todosLoading: computed(() => store.todosResource.isLoading()),
    period: computed(() => currentPeriod(valueOf(store.periodResource) ?? [], store.today(), store.fiscalYearStart())),
    figures: computed(() => valueOf(store.figuresResource)),
    figuresLoading: computed(() => store.figuresResource.isLoading()),
    /** cash balance, shown only for the books it was computed for */
    balance: computed(() => { const b = store.balanceValue(); return b && b.books === store.books() ? b.value : undefined; }),
    fiscalYearLabel: computed(() => fiscalYear(store.year(), store.fiscalYearStart()).label),
  })),
  withMethods(store => ({
    selectYear(year: number): void {
      patchState(store, { selectedYear: year });
    },
    /** «Stand berechnen»: the whole history once, on request (spec 1.100 §4.4) */
    async computeBalance(): Promise<void> {
      const books = store.books();
      if (!books || store.balanceLoading()) return;
      patchState(store, { balanceLoading: true });
      try {
        const q = store.scope(books);
        const [accounts, bookings, lines] = await Promise.all([
          store.fs.getDataOnceStrict<AccountModel>(AccountCollection, q),
          store.fs.getDataOnceStrict<BookingModel>(BookingCollection, q),
          store.fs.getDataOnceStrict<BookingLineModel>(BookingLineCollection, q),
        ]);
        patchState(store, { balanceValue: { books, value: liquidityBalance(lines, bookings, accounts) } });
      } catch (err) {
        console.warn('AccountingOverviewStore.computeBalance failed:', err);
      } finally {
        patchState(store, { balanceLoading: false });
      }
    },
  })),
);
