import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { collection, getDocs, limit, query, QueryDocumentSnapshot, startAfter } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  AvatarInfo, BillCollection, BillLine, BillModel, BillPayment, BookingCollection, BookingLineCollection, BookingLineModel, BookingModel, DbQuery, UserModel,
} from '@okr/shared-models';
import { findByKey, getQuery, getSystemQuery } from '@okr/shared-util-core';
import { ActivityService } from '@okr/activity-data-access';

import {
  BILL_PAYMENT_BOOKING_PAGE, BILL_PAYMENT_BOOKING_PAGES, BillPaymentCandidate, BillPaymentInput, billPaymentCandidates, isPayableBill, MAX_BILL_PAYMENT_CANDIDATES,
  openBillAmount,
} from '@okr/finance-bill-util';

/**
 * Booking keys per `bookingKey in [...]` read. Firestore allows 30 disjunctions per query, and the
 * tenant filter (`tenants array-contains-any [tenant, 'system']`) doubles them: 15 × 2 = 30.
 */
const BOOKING_KEY_CHUNK_SIZE = 15;

interface WriteBillPayload {
  mode: 'create' | 'update' | 'delete';
  billKey?: string;
  accountingTenantId?: string;
  bill?: {
    billId: string; title: string; billDate: string; dueDate: string; vendor: AvatarInfo | null; notes: string; paymentReference: string; creditorIban: string;
  };
  lines?: BillLine[];
}

export interface RecordBillPaymentResult { state: string; payments: BillPayment[]; bookingKey: string; }
interface RecordBillPaymentPayload {
  billKey: string; mode: 'post' | 'link'; paymentId: string; date: string; amount: number; bankAccountKey?: string; bookingKey?: string;
}


@Injectable({
  providedIn: 'root'
})
export class BillService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);

  public list(): Observable<BillModel[]> {
    return this.firestoreService.searchData<BillModel>(
      BillCollection,
      getSystemQuery(this.env.tenantId),
      'billDate',
      'desc'
    );
  }

  public read(key: string): Observable<BillModel | undefined> {
    return findByKey<BillModel>(this.list(), key);
  }

  /*-------------------------- native bills (spec 1.85 phase 3) --------------------------*/
  // `bills` is CF-write-only (firestore.rules): every write goes through writeBill / bookBill.

  /** Creates or updates a draft bill with its lines; returns the bill key. Rejects with the callable's error. */
  public async write(mode: 'create' | 'update', bill: BillModel, lines: BillLine[], currentUser?: UserModel): Promise<string> {
    const payload: WriteBillPayload = {
      mode,
      ...(mode === 'create' ? { accountingTenantId: bill.accountingTenantId } : { billKey: bill.okey }),
      bill: {
        billId: bill.billId ?? '', title: bill.title ?? '', billDate: bill.billDate ?? '', dueDate: bill.dueDate ?? '',
        vendor: bill.vendor ?? null, notes: bill.notes ?? '', paymentReference: bill.paymentReference ?? '', creditorIban: bill.creditorIban ?? '',
      },
      lines,
    };
    const fn = httpsCallable<WriteBillPayload, { billKey: string }>(this.functions(), 'writeBill');
    const result = await fn(payload);
    void this.activityService.log('bill', mode, currentUser, `${result.data.billKey}: ${bill.billId}`);
    return result.data.billKey;
  }

  /** Deletes a draft bill (a booked one is refused: its booking is deleted in the journal first). */
  public async delete(bill: BillModel, currentUser?: UserModel): Promise<void> {
    const fn = httpsCallable<WriteBillPayload, { billKey: string }>(this.functions(), 'writeBill');
    await fn({ mode: 'delete', billKey: bill.okey });
    void this.activityService.log('bill', 'delete', currentUser, `${bill.okey}: ${bill.billId}`);
  }

  /** Books a draft bill (issue booking `bill-{key}`); the bill becomes `todo`. */
  public async book(billKey: string, currentUser?: UserModel): Promise<{ bookingKey: string; bookingNo: number; state: string }> {
    const fn = httpsCallable<{ billKey: string }, { bookingKey: string; bookingNo: number; state: string }>(this.functions(), 'bookBill');
    const result = await fn({ billKey });
    void this.activityService.log('bill', 'book', currentUser, `${billKey}: ${result.data.bookingKey}`);
    return result.data;
  }

  /*-------------------------- payments (spec 1.85) --------------------------*/

  /**
   * The open bills of one set of books — the bank import's match candidates (spec 1.85 phase 2).
   * Tenant-scoped through getSystemQuery; rejects on a failed read, so an import never runs against a
   * silently empty candidate list.
   */
  public async listOpen(accountingTenantId: string): Promise<BillModel[]> {
    const bills = await this.readOnce<BillModel>(BillCollection, [
      ...getSystemQuery(this.env.tenantId),
      { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
    ], 'none');
    return bills.filter((b) => isPayableBill(b) && openBillAmount(b) > 0);
  }

  /**
   * The posted bookings dated `fromDate`..`toDate` that debit the payables account — the link
   * candidates of a bill payment and the source of the payment hints. The window is read oldest first
   * in pages (at most BILL_PAYMENT_BOOKING_PAGES × BILL_PAYMENT_BOOKING_PAGE bookings), each page's
   * lines in chunks. Bookings already linked on any bill are left out. Rejects on a failed read, so the
   * caller can tell "none" from "could not load".
   */
  public async listPaymentCandidates(
    accountingTenantId: string, payablesAccountKey: string, linkedBookingKeys: string[], fromDate: string, toDate: string,
    cap = MAX_BILL_PAYMENT_CANDIDATES,
  ): Promise<BillPaymentCandidate[]> {
    if (!payablesAccountKey || !accountingTenantId || !fromDate || toDate < fromDate) return [];
    const linked = new Set(linkedBookingKeys);
    const constraints = getQuery([
      ...getSystemQuery(this.env.tenantId),
      { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
      { key: 'status', operator: '==', value: 'posted' },
      { key: 'date', operator: '>=', value: fromDate },
      { key: 'date', operator: '<=', value: toDate },
    ], 'date', 'asc');
    const bookings: BookingModel[] = [];
    const lines: BookingLineModel[] = [];
    let last: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < BILL_PAYMENT_BOOKING_PAGES; page++) {
      const pageQuery = query(collection(this.firestoreService.firestore, BookingCollection), ...constraints,
        ...(last ? [startAfter(last)] : []), limit(BILL_PAYMENT_BOOKING_PAGE));
      const snapshot = await getDocs(pageQuery);
      const pageBookings = snapshot.docs.map((d) => ({ ...d.data(), okey: d.id }) as BookingModel)
        .filter((b) => !linked.has(b.okey) && !b.okey.startsWith('bill-') && !b.okey.startsWith('invoice-'));
      bookings.push(...pageBookings);
      const keys = pageBookings.map((b) => b.okey);
      for (let i = 0; i < keys.length; i += BOOKING_KEY_CHUNK_SIZE) {
        lines.push(...await this.readOnce<BookingLineModel>(BookingLineCollection, [
          ...getSystemQuery(this.env.tenantId),
          { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
          { key: 'bookingKey', operator: 'in', value: keys.slice(i, i + BOOKING_KEY_CHUNK_SIZE) },
        ], 'none'));
      }
      if (snapshot.docs.length < BILL_PAYMENT_BOOKING_PAGE) break;
      last = snapshot.docs[snapshot.docs.length - 1];
    }
    return billPaymentCandidates(lines, bookings, payablesAccountKey, linkedBookingKeys, fromDate, cap);
  }

  /**
   * Records an outgoing payment (spec 1.85). `payment.amount` is CHF; it is converted to Rappen here,
   * exactly once. `paymentId` is the dialog's idempotency key — pass the same one on a retry.
   */
  public async recordPayment(billKey: string, payment: BillPaymentInput, paymentId: string, currentUser?: UserModel): Promise<RecordBillPaymentResult> {
    const payload: RecordBillPaymentPayload = {
      billKey, mode: payment.mode, paymentId, date: payment.date, amount: Math.round(payment.amount * 100),
      ...(payment.mode === 'post' ? { bankAccountKey: payment.bankAccountKey } : { bookingKey: payment.bookingKey }),
    };
    const fn = httpsCallable<RecordBillPaymentPayload, RecordBillPaymentResult>(this.functions(), 'recordBillPayment');
    const result = await fn(payload);
    void this.activityService.log('bill', 'payment', currentUser, `${billKey}: ${payload.amount} (${payment.mode})`);
    return result.data;
  }

  /** Removes a linked payment from a bill; the booking stays in the journal. */
  public async unlinkPayment(billKey: string, bookingKey: string, currentUser?: UserModel): Promise<{ state: string; payments: BillPayment[] }> {
    const fn = httpsCallable<{ billKey: string; bookingKey: string }, { state: string; payments: BillPayment[] }>(this.functions(), 'unlinkBillPayment');
    const result = await fn({ billKey, bookingKey });
    void this.activityService.log('bill', 'unlink', currentUser, `${billKey}: ${bookingKey}`);
    return result.data;
  }

  private functions() {
    return getFunctions(getApp(), 'europe-west6');
  }

  /** A one-shot read that rejects on failure (FirestoreService.getDataOnce would return [] instead). */
  private async readOnce<T>(collectionName: string, dbQuery: DbQuery[], orderBy: string, sortOrder = 'asc', max?: number): Promise<T[]> {
    const constraints = getQuery(dbQuery, orderBy, sortOrder);
    if (max) constraints.push(limit(max));
    const ref = query(collection(this.firestoreService.firestore, collectionName), ...constraints);
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((d) => ({ ...d.data(), okey: d.id }) as T);
  }
}
