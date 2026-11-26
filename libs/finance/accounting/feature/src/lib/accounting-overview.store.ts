import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from, of } from 'rxjs';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  AccountCollection, AccountModel, BankImportRowCollection, BillCollection, BillModel, BookingCollection, BookingModel,
  BudgetLineCollection, BudgetLineModel, BudgetVersionCollection, BudgetVersionModel, DbQuery, ExpenseCollection, ExpenseModel, InvoiceCollection, InvoiceModel,
  PaymentOrderCollection, PaymentOrderModel, PeriodCollection, PeriodModel,
} from '@okr/shared-models';
import { getSystemQuery, getTodayStr } from '@okr/shared-util-core';
import { resourceParams } from '@okr/shared-util-angular';
import {
  currentPeriod, fiscalYearOptions, KeyFigures, keyFiguresFromSums, liquidityFromSums, NewsLists, nextVisit, openTotals, OverviewTodos, storeDateTimeOf,
  summarizeNews, summarizeTodos, VisitMarks,
} from '@okr/finance-accounting-util';
import { fiscalYear, fiscalYearOf, sumCellsByAccount } from '@okr/finance-reporting-util';

import { AccountingStore } from './accounting.store';
import { LedgerBalanceStore } from './ledger-balance.store';

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

/** Per device, user and books: when the overview was last seen (see `nextVisit`). */
const VISIT_STORAGE_PREFIX = 'okr.accounting.overview.visit';

function readVisit(storageKey: string): VisitMarks | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as VisitMarks : undefined;
  } catch {
    return undefined;
  }
}

function writeVisit(storageKey: string, marks: VisitMarks): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ since: marks.since, seenAt: marks.seenAt }));
  } catch {
    // private window or blocked storage: the next visit starts over with the last week
  }
}

/** «Seit deinem letzten Besuch»: the baseline and what was created after it. */
export interface OverviewNews {
  since: number;
  isFirst: boolean;
  lists: NewsLists;
}

export interface FigureInputs {
  accounts: AccountModel[];
  budgetVersions: BudgetVersionModel[];
  budgetLines: BudgetLineModel[];
}

/**
 * Accounting overview (spec 1.100 §4.4): to-dos, key figures of ONE fiscal year, cash balance, news since the last visit.
 * Key figures and cash come from the ledger balances (spec 1.177), not from bookings.
 */
export const AccountingOverviewStore = signalStore(
  withState({ selectedYear: 0 }),
  withProps(() => ({
    fs: inject(FirestoreService),
    tenantId: inject(ENV).tenantId,
    accountingStore: inject(AccountingStore),
    ledgerStore: inject(LedgerBalanceStore),
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

    /** One visit per store instance and books: reloading the to-dos must not move the baseline again. */
    const visits = new Map<string, VisitMarks & { isFirst: boolean }>();
    function visitFor(userKey: string, books: string): VisitMarks & { isFirst: boolean } {
      const storageKey = `${VISIT_STORAGE_PREFIX}.${userKey}.${books}`;
      let marks = visits.get(storageKey);
      if (!marks) {
        marks = nextVisit(readVisit(storageKey), Date.now());
        writeVisit(storageKey, marks);
        visits.set(storageKey, marks);
      }
      return marks;
    }

    /** to-dos and news share the bill, invoice and expense reads */
    async function loadTodos(books: string, today: string, userKey: string): Promise<{ todos: OverviewTodos; news: OverviewNews }> {
      const q = scope(books);
      const visit = visitFor(userKey, books);
      const since = storeDateTimeOf(visit.since);
      const [bookingsForReview, bills, paymentOrders, invoices, expenses, unmapped, mapped, failed, newBookings] = await Promise.all([
        fs.countOnce(BookingCollection, [...q, { key: 'status', operator: '==', value: 'forReview' }]),
        settle(fs.getDataOnceStrict<BillModel>(BillCollection, q), 'bills'),
        settle(fs.getDataOnceStrict<PaymentOrderModel>(PaymentOrderCollection, q), 'payment orders'),
        settle(fs.getDataOnceStrict<InvoiceModel>(InvoiceCollection, q), 'invoices'),
        settle(fs.getDataOnceStrict<ExpenseModel>(ExpenseCollection, q), 'expenses'),
        fs.countOnce(BankImportRowCollection, [...q, { key: 'status', operator: '==', value: 'unmapped' }]),
        fs.countOnce(BankImportRowCollection, [...q, { key: 'status', operator: '==', value: 'mapped' }]),
        fs.countOnce(BankImportRowCollection, [...q, { key: 'status', operator: '==', value: 'error' }]),
        // index: bookings (tenants, accountingTenantId, isArchived, createdAt desc)
        settle(fs.getDataOnceStrict<BookingModel>(BookingCollection, [...q, { key: 'createdAt', operator: '>=', value: since }], 'createdAt', 'desc'), 'new bookings'),
      ]);
      const rows = [unmapped, mapped, failed];
      return {
        todos: {
          ...summarizeTodos({ bills, paymentOrders, invoices, expenses, today }),
          bookingsForReview,
          bankRowsOpen: rows.some(r => r === undefined) ? undefined : rows.reduce((s: number, r) => s + (r ?? 0), 0),
          openTotals: openTotals(bills, invoices, today),
        },
        news: { since: visit.since, isFirst: visit.isFirst, lists: summarizeNews({ since, bookings: newBookings, bills, invoices, expenses }) },
      };
    }

    /** what the key figures need besides the balances: accounts and budgets of the books (one-shot) */
    async function loadFigureInputs(books: string): Promise<FigureInputs> {
      const q = scope(books);
      const [accounts, budgetVersions, budgetLines] = await Promise.all([
        fs.getDataOnceStrict<AccountModel>(AccountCollection, q),
        fs.getDataOnceStrict<BudgetVersionModel>(BudgetVersionCollection, q),
        fs.getDataOnceStrict<BudgetLineModel>(BudgetLineCollection, q),
      ]);
      return { accounts, budgetVersions, budgetLines };
    }

    return {
      todosResource: rxResource({
        params: resourceParams(() => ({ userKey: store.userKey(), books: store.books(), today: store.today() })),
        stream: ({ params }) => params.userKey && params.books ? from(loadTodos(params.books, params.today, params.userKey)) : of(undefined),
      }),
      periodResource: rxResource({
        params: resourceParams(() => ({ userKey: store.userKey(), books: store.books() })),
        stream: ({ params }) => params.userKey && params.books
          ? from(fs.getDataOnceStrict<PeriodModel>(PeriodCollection, scope(params.books)))
          : of([] as PeriodModel[]),
      }),
      figureInputsResource: rxResource({
        params: resourceParams(() => ({ userKey: store.userKey(), books: store.books() })),
        stream: ({ params }) => params.userKey && params.books ? from(loadFigureInputs(params.books)) : of(undefined),
      }),
    };
  }),
  withComputed(store => ({
    todos: computed(() => valueOf(store.todosResource)?.todos),
    news: computed(() => valueOf(store.todosResource)?.news),
    todosLoading: computed(() => store.todosResource.isLoading()),
    period: computed(() => currentPeriod(valueOf(store.periodResource) ?? [], store.today(), store.fiscalYearStart())),
    figures: computed<KeyFigures | undefined>(() => {
      const inputs = valueOf(store.figureInputsResource);
      if (!inputs || !store.accountingStore.configLoaded() || store.ledgerStore.isLoading()) return undefined;
      const fy = fiscalYear(store.year(), store.fiscalYearStart());
      return keyFiguresFromSums({ ...inputs, from: fy.from, to: fy.to, fiscalYear: store.year(), sums: sumCellsByAccount(store.ledgerStore.docs(), fy.from, fy.to) });
    }),
    figuresLoading: computed(() => store.figureInputsResource.isLoading() || store.ledgerStore.isLoading()),
    /** cash on hand: every posted cash line since the ledger's start (undefined while loading) */
    balance: computed(() => {
      const inputs = valueOf(store.figureInputsResource);
      if (!inputs || store.ledgerStore.isLoading()) return undefined;
      return liquidityFromSums(sumCellsByAccount(store.ledgerStore.docs(), '', ''), inputs.accounts);
    }),
    fiscalYearLabel: computed(() => fiscalYear(store.year(), store.fiscalYearStart()).label),
  })),
  withMethods(store => ({
    selectYear(year: number): void {
      patchState(store, { selectedYear: year });
    },
  })),
  withHooks(store => ({
    onInit(): void { store.ledgerStore.use(); },
    onDestroy(): void { store.ledgerStore.release(); },
  })),
);
