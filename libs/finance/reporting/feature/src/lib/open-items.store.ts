import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { I18nService } from '@okr/shared-i18n';
import { resourceParams, showToast } from '@okr/shared-util-angular';
import { convertDateFormatToString, DateFormat, fill, getTodayStr } from '@okr/shared-util-core';

import { AccountingStore } from '@okr/finance-accounting-feature';
import { ReportingService } from '@okr/finance-reporting-data-access';
import {
  computeOpenItems, downloadCsv, fiscalYear, fiscalYearOf, OpenItemDocument, OpenItemsResult, OpenItemsSide, openItemsToCsv,
  REPORTING_I18N_KEYS, ReportingI18n,
} from '@okr/finance-reporting-util';

type OpenItemsState = {
  cutoff: string;   // StoreDate; the reconciliation date (spec 1.86 D3)
};

/**
 * Offene-Posten-Abstimmung (spec 1.86): open bills and invoices at the cut-off against the Kreditoren
 * and Debitoren account balance, with the bookings and documents that explain a difference. Read-only;
 * computed client-side from the posted ledger (the reports' read) and the documents of the books.
 */
export const OpenItemsStore = signalStore(
  withState<OpenItemsState>({ cutoff: getTodayStr(DateFormat.StoreDate) }),
  withProps(() => ({
    reportingService: inject(ReportingService),
    accountingStore: inject(AccountingStore),
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
      bookingsResource: rxResource({
        params, stream: ({ params }) => params.id && !params.external ? store.reportingService.getJournalEntries(params.id) : of([]),
      }),
      linesResource: rxResource({
        params, stream: ({ params }) => params.id && !params.external ? store.reportingService.getAllLines(params.id) : of([]),
      }),
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
    isLoading: computed(() => store.bookingsResource.isLoading() || store.linesResource.isLoading()
      || store.billsResource.isLoading() || store.invoicesResource.isLoading()),
    /** Scope start (Q3): the first day of the fiscal year that contains the cut-off. */
    start: computed(() => {
      const startMonth = store.accountingStore.config()?.fiscalYearStart ?? 1;
      return fiscalYear(fiscalYearOf(store.cutoff(), startMonth), startMonth).from;
    }),
  })),
  withComputed(store => {
    const side = (side: OpenItemsSide, accountKey: string): OpenItemsResult => computeOpenItems({
      side, accountKey, cutoff: store.cutoff(), start: store.start(),
      bills: side === 'payables' ? store.billsResource.value() ?? [] : [],
      invoices: side === 'receivables' ? store.invoicesResource.value() ?? [] : [],
      bookings: store.bookingsResource.value() ?? [],
      lines: store.linesResource.value() ?? [],
    });
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
);
