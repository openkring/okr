import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { from, of } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { BookingLineModel, BookingModel } from '@okr/shared-models';
import { resourceParams, showToast } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { AccountingStore, LedgerBalanceStore } from '@okr/finance-accounting-feature';
import { BookingLineService, BookingService } from '@okr/finance-booking-data-access';
import { ReportingService } from '@okr/finance-reporting-data-access';
import {
  computeOpenItems, downloadCsv, fiscalYear, fiscalYearOf, OpenItemDocument, openItemsLinkedKeys, openItemsOpening, OpenItemsResult, OpenItemsSide,
  openItemsToCsv, openingOf, REPORTING_I18N_KEYS, ReportingI18n, withOpening,
} from '@okr/finance-reporting-util';

type OpenItemsState = {
  cutoff: string;   // StoreDate; the reconciliation date (spec 1.86 D3)
};

/**
 * Offene-Posten-Abstimmung (spec 1.86): open bills and invoices at the cut-off against the Kreditoren
 * and Debitoren account balance, with the bookings and documents that explain a difference. Read-only.
 * Since spec 1.177 §6.4 it reads only the bookings of the scope (fiscal-year start … cut-off), the bookings the scope's
 * documents name, and the storno bookings; everything earlier enters as the opening balance from the ledger balances.
 * The result equals the one over the whole ledger.
 */

/** The bookings of the scope plus the linked ones, with their lines. */
export interface ScopeLedger { bookings: BookingModel[]; lines: BookingLineModel[] }
export const OpenItemsStore = signalStore(
  withState<OpenItemsState>({ cutoff: getTodayStr(DateFormat.StoreDate) }),
  withProps(() => ({
    reportingService: inject(ReportingService),
    bookingService: inject(BookingService),
    bookingLineService: inject(BookingLineService),
    accountingStore: inject(AccountingStore),
    ledgerStore: inject(LedgerBalanceStore),
    router: inject(Router),
    toastController: inject(ToastController),
    i18n: inject(I18nService).translateAll(REPORTING_I18N_KEYS) as ReportingI18n,
  })),
  withProps(store => {
    // bexio-managed books have no native documents to reconcile: read nothing
    const params = resourceParams(() => ({
      id: store.accountingStore.accountingTenantId(),
      external: store.accountingStore.isExternallyManaged(),
    }));
    return {
      billsResource: rxResource({
        params, stream: ({ params }) => params.id && !params.external ? store.reportingService.getBills(params.id) : of([]),
      }),
      invoicesResource: rxResource({
        params, stream: ({ params }) => params.id && !params.external ? store.reportingService.getInvoices(params.id) : of([]),
      }),
    };
  }),
  withComputed(store => ({
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
    isExternallyManaged: computed(() => store.accountingStore.isExternallyManaged()),
    /** Scope start (Q3): the first day of the fiscal year that contains the cut-off. */
    start: computed(() => {
      const startMonth = store.accountingStore.config()?.fiscalYearStart ?? 1;
      return fiscalYear(fiscalYearOf(store.cutoff(), startMonth), startMonth).from;
    }),
  })),
  withProps(store => {
    async function loadScope(books: string, start: string, cutoff: string, linked: string[]): Promise<ScopeLedger> {
      const inScope = await store.bookingService.listPeriod(books, start, cutoff);
      const have = new Set(inScope.map(b => b.okey));
      const extra = await store.bookingService.listByKeys(books, linked.filter(k => !have.has(k)));
      const bookings = [...inScope, ...extra];
      const lines = await store.bookingLineService.listForBookings(books, bookings.map(b => b.okey));
      return { bookings, lines };
    }
    return {
      scopeResource: rxResource({
        params: resourceParams(() => {
          const id = store.accountingStore.accountingTenantId();
          if (!id || store.accountingStore.isExternallyManaged() || !store.billsResource.hasValue() || !store.invoicesResource.hasValue()) return undefined;
          const bills = store.billsResource.value() ?? [];
          const invoices = store.invoicesResource.value() ?? [];
          const start = store.start(), cutoff = store.cutoff();
          const linked = [...new Set([
            ...openItemsLinkedKeys('payables', start, cutoff, bills, invoices),
            ...openItemsLinkedKeys('receivables', start, cutoff, bills, invoices),
          ])].sort();
          return { id, start, cutoff, linked };
        }),
        stream: ({ params }) => from(loadScope(params.id, params.start, params.cutoff, params.linked)),
      }),
    };
  }),
  withComputed(store => ({
    isLoading: computed(() => store.scopeResource.isLoading() || store.billsResource.isLoading() || store.invoicesResource.isLoading()
      || store.ledgerStore.isLoading() || store.ledgerStore.refreshing()),
  })),
  withComputed(store => {
    const side = (side: OpenItemsSide, accountKey: string): OpenItemsResult => {
      const scope = store.scopeResource.hasValue() ? store.scopeResource.value() : undefined;
      const bookings = scope?.bookings ?? [];
      const lines = scope?.lines ?? [];
      const start = store.start();
      const result = computeOpenItems({
        side, accountKey, cutoff: store.cutoff(), start,
        bills: side === 'payables' ? store.billsResource.value() ?? [] : [],
        invoices: side === 'receivables' ? store.invoicesResource.value() ?? [] : [],
        bookings, lines,
      });
      // everything before the scope, from the balances — dated years only, as computeOpenItems skips undated bookings
      const dated = store.ledgerStore.docs().filter(d => d.year > 0);
      const before = accountKey ? openingOf(dated, [accountKey], start).get(accountKey) : undefined;
      return withOpening(result, openItemsOpening(side, accountKey, start, before, bookings, lines));
    };
    return {
      // legacy config docs lack the fields (Firestore reads skip model defaults)
      payables: computed(() => side('payables', store.accountingStore.config()?.payablesAccountKey ?? '')),
      receivables: computed(() => side('receivables', store.accountingStore.config()?.receivablesAccountKey ?? '')),
    };
  }),
  withMethods(store => ({
    setAccountingTenant(id: string): void {
      store.accountingStore.setTenant(id);
    },

    /** Ignores an empty or malformed value (the date input is cleared while typing). */
    setCutoff(cutoff: string): void {
      if (/^\d{8}$/.test(cutoff)) patchState(store, { cutoff });
    },

    /** Opens the booking in the journal, in its year. */
    async openJournal(bookingKey: string, date: string): Promise<void> {
      await store.router.navigate(['/accounting', store.accountingTenantId(), 'journal', 'c-journal'],
        { queryParams: { bookingKey, year: date.slice(0, 4) } });
    },

    /** Opens the document's view modal in its list (where a payment can be recorded or linked). */
    async openDocument(doc: OpenItemDocument): Promise<void> {
      await store.router.navigate(doc.kind === 'bill'
        ? ['/accounting', store.accountingTenantId(), 'bill', 'all', 'c-bill']
        : ['/accounting', store.accountingTenantId(), 'invoice', 'all', 'c-invoice'],
      { queryParams: doc.kind === 'bill' ? { billKey: doc.key } : { invoiceKey: doc.key } });
    },

    /** The open documents of one side at the cut-off as CSV (the Offene-Posten-Liste for the closing). */
    async exportCsv(side: OpenItemsSide): Promise<void> {
      const result = side === 'payables' ? store.payables() : store.receivables();
      const label = side === 'payables' ? store.i18n.open_items_payables() : store.i18n.open_items_receivables();
      downloadCsv(openItemsToCsv(result.documents), `${store.accountingTenantId()}-${label}-${result.cutoff}.csv`);
      await showToast(store.toastController, fill(store.i18n.open_items_export_conf(), { count: String(result.documents.length) }));
    },

    viewDate(storeDate: string): string {
      return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) || storeDate;
    },
  })),
  withHooks(store => ({
    onInit(): void { store.ledgerStore.use(); },
    onDestroy(): void { store.ledgerStore.release(); },
  })),
);
