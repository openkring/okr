import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { BillCollection, BillModel, BillPayment, BookingCollection, BookingLineCollection, BookingLineModel, BookingModel, DbQuery, UserModel } from '@okr/shared-models';
import { findByKey, getQuery, getSystemQuery } from '@okr/shared-util-core';
import { ActivityService } from '@okr/activity-data-access';

import {
  BILL_PAYMENT_BOOKING_LIMIT, BillPaymentCandidate, BillPaymentInput, billPaymentCandidates, getBillIndex, isPayableBill, MAX_BILL_PAYMENT_CANDIDATES,
  openBillAmount,
} from '@okr/finance-bill-util';

/**
 * Booking keys per `bookingKey in [...]` read. Firestore allows 30 disjunctions per query, and the
 * tenant filter (`tenants array-contains-any [tenant, 'system']`) doubles them: 15 × 2 = 30.
 */
const BOOKING_KEY_CHUNK_SIZE = 15;

export interface RecordBillPaymentResult { state: string; payments: BillPayment[]; bookingKey: string; }
interface RecordBillPaymentPayload {
  billKey: string; mode: 'post' | 'link'; paymentId: string; date: string; amount: number; bankAccountKey?: string; bookingKey?: string;
}

const PFX = '@finance/bill/data-access.';

@Injectable({
  providedIn: 'root'
})
export class BillService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

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

  public async create(bill: BillModel, currentUser?: UserModel): Promise<string | undefined> {
    bill.index = getBillIndex(bill);
    const key = await this.firestoreService.createModel<BillModel>(BillCollection, bill, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('bill', 'create', currentUser, `${key}: ${bill.billId}`);
    return key;
  }

  public async update(bill: BillModel, currentUser?: UserModel): Promise<string | undefined> {
    bill.index = getBillIndex(bill);
    const key = await this.firestoreService.updateModel<BillModel>(BillCollection, bill, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('bill', 'update', currentUser, `${key}: ${bill.billId}`);
    return key;
  }

  public async delete(bill: BillModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<BillModel>(BillCollection, bill, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('bill', 'delete', currentUser, `${bill.okey}: ${bill.billId}`);
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
   * The posted bookings that debit the payables account from `fromDate` on — the link candidates of a
   * bill payment and the source of the payment hints. Bookings already linked on any bill are left
   * out. Rejects on a failed read, so the caller can tell "none" from "could not load".
   */
  public async listPaymentCandidates(
    accountingTenantId: string, payablesAccountKey: string, linkedBookingKeys: string[], fromDate: string, cap = MAX_BILL_PAYMENT_CANDIDATES,
  ): Promise<BillPaymentCandidate[]> {
    if (!payablesAccountKey || !accountingTenantId) return [];
    const bookingsQuery: DbQuery[] = [
      ...getSystemQuery(this.env.tenantId),
      { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
      { key: 'status', operator: '==', value: 'posted' },
      { key: 'date', operator: '>=', value: fromDate },
    ];
    const linked = new Set(linkedBookingKeys);
    const bookings = (await this.readOnce<BookingModel>(BookingCollection, bookingsQuery, 'date', 'asc', BILL_PAYMENT_BOOKING_LIMIT))
      .filter((b) => !linked.has(b.okey) && !b.okey.startsWith('bill-') && !b.okey.startsWith('invoice-'));
    if (bookings.length === 0) return [];
    const keys = bookings.map((b) => b.okey);
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += BOOKING_KEY_CHUNK_SIZE) chunks.push(keys.slice(i, i + BOOKING_KEY_CHUNK_SIZE));
    const lines = await Promise.all(chunks.map((chunk) => this.readOnce<BookingLineModel>(BookingLineCollection, [
      ...getSystemQuery(this.env.tenantId),
      { key: 'accountingTenantId', operator: '==', value: accountingTenantId },
      { key: 'bookingKey', operator: 'in', value: chunk },
    ], 'none')));
    return billPaymentCandidates(lines.flat(), bookings, payablesAccountKey, linkedBookingKeys, fromDate, cap);
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
