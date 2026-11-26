import { inject, Injectable } from '@angular/core';
import { combineLatest, firstValueFrom, map, Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BillCollection, BillModel, BookingCollection, BookingLineCollection, BookingLineModel, BookingModel, InvoiceCollection, InvoiceModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { AccountBalanceEntry, aggregateAccountBalances, downloadCsv, exportToCsv } from '@okr/finance-reporting-util';

/** documentId in [...]: 15 keys x the 2-value tenant filter = Firestore's 30 disjunctions. */
const BOOKING_KEY_CHUNK = 15;
const PARALLEL_READS = 10;

@Injectable({ providedIn: 'root' })
export class ReportingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public getJournalEntries(accountingTenantId: string, orderBy = 'date', sortOrder = 'desc'): Observable<BookingModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
      { key: 'status', operator: '==' as const, value: 'posted' },
    ];
    return this.firestoreService.searchData<BookingModel>(BookingCollection, query, orderBy, sortOrder);
  }

  public getAllLines(accountingTenantId: string): Observable<BookingLineModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    // 'none': a line has no `name` — the default orderBy('name') would drop every document
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query, 'none');
  }

  /**
   * The lines of the given projects and Kostenstellen, live, all years, each line once. One equality query per key
   * (existing indexes) instead of `getAllLines`: the whole ledger (scs: 22,500 lines + 11,100 bookings) overfills
   * the 40 MB Firestore cache of the browser and holds its IndexedDB for seconds.
   */
  public getLinesOf(accountingTenantId: string, projectKeys: string[], costCenterKeys: string[]): Observable<BookingLineModel[]> {
    const lines = (key: 'projectKey' | 'costCenterKey', value: string): Observable<BookingLineModel[]> =>
      this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, [
        ...getSystemQuery(this.tenantId),
        { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
        { key, operator: '==' as const, value },
      ], 'none');
    return combineLatest([
      ...projectKeys.map(key => lines('projectKey', key)),
      ...costCenterKeys.map(key => lines('costCenterKey', key)),
    ]).pipe(map(parts => [...new Map(parts.flat().map(line => [line.okey, line])).values()]));
  }

  /** The bookings with the given keys, any status. One-shot; rejects on a failed read. */
  public async getBookings(accountingTenantId: string, bookingKeys: string[]): Promise<BookingModel[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < bookingKeys.length; i += BOOKING_KEY_CHUNK) chunks.push(bookingKeys.slice(i, i + BOOKING_KEY_CHUNK));
    const bookings: BookingModel[] = [];
    for (let i = 0; i < chunks.length; i += PARALLEL_READS) {
      const parts = await Promise.all(chunks.slice(i, i + PARALLEL_READS).map(keys =>
        this.firestoreService.getDataOnceStrict<BookingModel>(BookingCollection, [
          ...getSystemQuery(this.tenantId),
          { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
          { key: '__name__', operator: 'in', value: keys },
        ])));
      bookings.push(...parts.flat());
    }
    return bookings;
  }

  /** The bills of the books (Offene Posten, spec 1.86); desc = the index the bill list uses, the util re-sorts. */
  public getBills(accountingTenantId: string): Observable<BillModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BillModel>(BillCollection, query, 'billDate', 'desc');
  }

  /** The invoices of the books (Offene Posten, spec 1.86); desc = the index the invoice list uses, the util re-sorts. */
  public getInvoices(accountingTenantId: string): Observable<InvoiceModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<InvoiceModel>(InvoiceCollection, query, 'invoiceDate', 'desc');
  }

  public async getAccountBalances(accountingTenantId: string): Promise<AccountBalanceEntry[]> {
    const lines = await firstValueFrom(this.getAllLines(accountingTenantId));
    return aggregateAccountBalances(lines);
  }

  public async exportBalancesToCsv(accountingTenantId: string): Promise<void> {
    const balances = await this.getAccountBalances(accountingTenantId);
    const csv = exportToCsv(balances);
    downloadCsv(csv, `account-balances-${accountingTenantId}.csv`);
  }
}
