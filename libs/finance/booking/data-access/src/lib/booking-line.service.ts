import { inject, Injectable } from '@angular/core';
import { combineLatest, map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BookingLineCollection, BookingLineModel, DbQuery } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/** `bookingKey in [...]`: 15 keys × the 2-value tenant filter = Firestore's 30 disjunctions. */
const BOOKING_KEY_CHUNK = 15;
const PARALLEL_READS = 10;

@Injectable({ providedIn: 'root' })
export class BookingLineService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  /**
   * The lines of the given bookings (spec 1.102): `bookingKey in [...]`, 15 keys per read (Firestore
   * allows 30 disjunctions; the tenant filter doubles them), up to 10 reads in parallel. One-shot;
   * rejects on a failed read.
   */
  public async listForBookings(accountingTenantId: string, bookingKeys: string[]): Promise<BookingLineModel[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < bookingKeys.length; i += BOOKING_KEY_CHUNK) chunks.push(bookingKeys.slice(i, i + BOOKING_KEY_CHUNK));
    const lines: BookingLineModel[] = [];
    for (let i = 0; i < chunks.length; i += PARALLEL_READS) {
      const parts = await Promise.all(chunks.slice(i, i + PARALLEL_READS).map(keys =>
        this.firestoreService.getDataOnceStrict<BookingLineModel>(BookingLineCollection, [
          ...this.booksQuery(accountingTenantId),
          { key: 'bookingKey', operator: 'in', value: keys },
        ])));
      lines.push(...parts.flat());
    }
    return lines;
  }

  /**
   * The lines of the given projects and Kostenstellen, live, all years, each line once (spec 1.177 R5): one equality
   * query per key, served by the single-field indexes. What a project result needs instead of the whole ledger.
   */
  public listByDimensions(accountingTenantId: string, projectKeys: string[], costCenterKeys: string[]): Observable<BookingLineModel[]> {
    const lines = (key: 'projectKey' | 'costCenterKey', value: string): Observable<BookingLineModel[]> =>
      this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, [
        ...this.booksQuery(accountingTenantId),
        { key, operator: '==', value },
      ], 'none');
    const parts = [...projectKeys.map(k => lines('projectKey', k)), ...costCenterKeys.map(k => lines('costCenterKey', k))];
    if (parts.length === 0) return of([]);
    return combineLatest(parts).pipe(map(all => [...new Map(all.flat().map(line => [line.okey, line])).values()]));
  }

  private booksQuery(accountingTenantId: string): DbQuery[] {
    return [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
    ];
  }

  /**
   * How many booking lines of the books are on one of the given accounts (spec 1.177 R11): server-side `count()`
   * per 15 keys (`accountKey in [...]` × the two-value tenant filter = 30 disjunctions), summed. Reads no line.
   * `undefined` when any count could not be read (offline, denied): the caller must treat that as «in use»,
   * never as 0 — an account with bookings would otherwise be deletable.
   * @param accountKeys the account okeys to look for — an empty list is never in use.
   */
  public async countByAccountKeys(accountingTenantId: string, accountKeys: string[]): Promise<number | undefined> {
    const keys = [...new Set(accountKeys)];
    if (keys.length === 0) return 0;
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += BOOKING_KEY_CHUNK) chunks.push(keys.slice(i, i + BOOKING_KEY_CHUNK));
    const counts = await Promise.all(chunks.map(chunk => this.firestoreService.countOnce(BookingLineCollection, [
      ...this.booksQuery(accountingTenantId),
      { key: 'accountKey', operator: 'in', value: chunk },
    ])));
    return counts.some(c => c === undefined) ? undefined : counts.reduce((sum: number, c) => sum + (c ?? 0), 0);
  }
}
