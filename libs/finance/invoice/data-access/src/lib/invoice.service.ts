import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  BookingCollection, BookingLineCollection, BookingLineModel, BookingModel, DbQuery, InvoiceCollection, InvoiceModel, InvoicePayment,
  InvoicePositionCollection, InvoicePositionModel, UserModel,
} from '@okr/shared-models';
import { addDuration, findByKey, getQuery, getSystemQuery, getTodayStr } from '@okr/shared-util-core';
import { ActivityService } from '@okr/activity-data-access';

import {
  BOOKING_KEY_CHUNK_SIZE, chunked, InvoiceHeaderInput, InvoicePaymentCandidate, invoicePaymentCandidates, InvoicePaymentInput, InvoicePositionInput,
  linkableBookings, PAYMENT_CANDIDATE_BOOKING_LIMIT, toInvoiceHeaderInput,
} from '@okr/finance-invoice-util';

/** The `writeInvoice` callable's request (apps/functions/src/invoice/write-invoice.ts). */
export interface WriteInvoicePayload {
  mode: 'create' | 'update' | 'delete';
  invoiceKey?: string;
  accountingTenantId?: string;   // create only
  invoice?: InvoiceHeaderInput;
  positions?: InvoicePositionInput[];
}

/**
 * How far before the invoice date a linkable bank booking may lie (an early payment). Kept short: the
 * read runs forward from here, so a long look-back would spend the booking limit on bookings that
 * cannot be the payment and push the real ones (after the invoice date) out.
 */
export const PAYMENT_CANDIDATE_LOOKBACK_DAYS = 7;

/** The `issueInvoice` callable's result. */
export interface IssueInvoiceResult {
  invoiceNo: number;
  documentKey: string;
  bookingKey: string;
}

/** The `recordInvoicePayment` callable's request (apps/functions/src/invoice/record-invoice-payment.ts). */
export interface RecordInvoicePaymentPayload {
  invoiceKey: string;
  mode: 'post' | 'link';
  paymentId: string;
  date: string;
  amount: number;            // Rappen
  bankAccountKey?: string;
  bookingKey?: string;
}

/** The `recordInvoicePayment` callable's result: the invoice's state and payments after the write. */
export interface RecordInvoicePaymentResult {
  state: string;
  payments: InvoicePayment[];
  bookingKey: string;
}

/** The `cancelInvoice` callable's result. */
export interface CancelInvoiceResult {
  state: 'cancelled';
  stornoBookingKey: string;
}

/** The `createPaymentConfirmation` callable's result. */
export interface PaymentConfirmationResult {
  documentKey: string;
  content: string;           // base64 PDF
}

/**
 * Invoices and their positions are written by Cloud Functions only (firestore.rules: `allow write:
 * if false`): drafts through `writeInvoice`, issuing through `issueInvoice` (spec 1.76). Every write
 * method rejects with the callable's HttpsError; `details.reason` tells the caller why
 * (see `invoiceRefusalReasons` in @okr/finance-invoice-util). The caller shows the toast.
 */
@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);

  /** Creates a draft with its positions; returns the new invoice's key. */
  public async create(invoice: InvoiceModel, positions: InvoicePositionInput[], currentUser?: UserModel): Promise<string> {
    const { invoiceKey } = await this.writeViaFunction({
      mode: 'create',
      accountingTenantId: invoice.accountingTenantId,
      invoice: toInvoiceHeaderInput(invoice),
      positions,
    });
    void this.activityService.log('invoice', 'create', currentUser, `${invoiceKey}: draft`);
    return invoiceKey;
  }

  public read(key: string): Observable<InvoiceModel | undefined> {
    return findByKey<InvoiceModel>(this.list(), key);
  }

  /** Replaces header and positions of a draft (the server refuses anything but a draft). */
  public async update(invoice: InvoiceModel, positions: InvoicePositionInput[], currentUser?: UserModel): Promise<void> {
    await this.writeViaFunction({
      mode: 'update',
      invoiceKey: invoice.okey,
      invoice: toInvoiceHeaderInput(invoice),
      positions,
    });
    void this.activityService.log('invoice', 'update', currentUser, `${invoice.okey}: draft`);
  }

  /** Deletes a draft with its positions (the server refuses anything but a draft). */
  public async delete(invoice: InvoiceModel, currentUser?: UserModel): Promise<void> {
    await this.writeViaFunction({ mode: 'delete', invoiceKey: invoice.okey });
    void this.activityService.log('invoice', 'delete', currentUser, `${invoice.okey}: draft`);
  }

  /** Issues a draft: number, PDF, finance-document and the Debitoren booking — all on the server. */
  public async issue(invoiceKey: string, currentUser?: UserModel): Promise<IssueInvoiceResult> {
    const fn = httpsCallable<{ invoiceKey: string }, IssueInvoiceResult>(getFunctions(getApp(), 'europe-west6'), 'issueInvoice');
    const result = await fn({ invoiceKey });
    void this.activityService.log('invoice', 'issue', currentUser, `${invoiceKey}: ${result.data.invoiceNo}`);
    return result.data;
  }

  /**
   * Records a received payment (spec 1.76 phase 2). `payment.amount` is CHF; it is converted to Rappen
   * here, exactly once. `paymentId` is the dialog's idempotency key — pass the same one on a retry.
   */
  public async recordPayment(invoiceKey: string, payment: InvoicePaymentInput, paymentId: string, currentUser?: UserModel): Promise<RecordInvoicePaymentResult> {
    const payload: RecordInvoicePaymentPayload = {
      invoiceKey,
      mode: payment.mode,
      paymentId,
      date: payment.date,
      amount: Math.round(payment.amount * 100),
      ...(payment.mode === 'post' ? { bankAccountKey: payment.bankAccountKey } : { bookingKey: payment.bookingKey }),
    };
    const fn = httpsCallable<RecordInvoicePaymentPayload, RecordInvoicePaymentResult>(this.functions(), 'recordInvoicePayment');
    const result = await fn(payload);
    void this.activityService.log('invoice', 'payment', currentUser, `${invoiceKey}: ${payload.amount} (${payment.mode})`);
    return result.data;
  }

  /** Cancels an issued, unpaid invoice with a reversal booking dated `date` (StoreDate). */
  public async cancel(invoiceKey: string, date: string, reason: string, currentUser?: UserModel): Promise<CancelInvoiceResult> {
    const fn = httpsCallable<{ invoiceKey: string; date: string; reason: string }, CancelInvoiceResult>(this.functions(), 'cancelInvoice');
    const result = await fn({ invoiceKey, date, reason });
    void this.activityService.log('invoice', 'cancel', currentUser, `${invoiceKey}: ${result.data.stornoBookingKey}`);
    return result.data;
  }

  /** Renders the payment confirmation of a paid invoice on the server; returns it as base64 PDF. */
  public async createPaymentConfirmation(invoiceKey: string): Promise<PaymentConfirmationResult> {
    const fn = httpsCallable<{ invoiceKey: string }, PaymentConfirmationResult>(this.functions(), 'createPaymentConfirmation');
    const result = await fn({ invoiceKey });
    return result.data;
  }

  /**
   * The bank bookings a payment of this invoice may be linked to: posted bookings of the accounting
   * tenant that credit the receivables account, shown newest first, at most MAX_PAYMENT_CANDIDATES,
   * without the ones already linked on the invoice and without okr's own `invoice-…` bookings (see
   * `invoicePaymentCandidates`). Rejects when a read fails, so the caller can tell "no candidates"
   * from "could not load".
   *
   * Bounded in two steps: first the EARLIEST PAYMENT_CANDIDATE_BOOKING_LIMIT posted bookings dated
   * from PAYMENT_CANDIDATE_LOOKBACK_DAYS before the invoice date on (a payment arrives after its
   * invoice, rarely a few days before), ordered by date ascending so that bookings just after the
   * invoice date are never pushed out by newer ones (needs the bookings index tenants/accountingTenantId/isArchived/status/
   * date ASC); then only the lines of those bookings, read with `bookingKey in [...]` in chunks of
   * BOOKING_KEY_CHUNK_SIZE. The receivables account is matched in memory.
   */
  public async listPaymentCandidates(invoice: InvoiceModel, receivablesAccountKey: string): Promise<InvoicePaymentCandidate[]> {
    if (!receivablesAccountKey || !invoice.accountingTenantId) return [];
    const fromDate = addDuration(invoice.invoiceDate || getTodayStr(), { days: -PAYMENT_CANDIDATE_LOOKBACK_DAYS });
    const bookingsQuery: DbQuery[] = [
      ...getSystemQuery(this.env.tenantId),
      { key: 'accountingTenantId', operator: '==', value: invoice.accountingTenantId },
      { key: 'status', operator: '==', value: 'posted' },
      { key: 'date', operator: '>=', value: fromDate },
    ];
    const bookings = await this.readOnce<BookingModel>(BookingCollection, bookingsQuery, 'date', 'asc', PAYMENT_CANDIDATE_BOOKING_LIMIT);
    const linked = (invoice.payments ?? []).map((p) => p.bookingKey).filter((k) => !!k);
    const linkable = linkableBookings(bookings, linked);
    if (linkable.length === 0) return [];

    const lineChunks = await Promise.all(chunked(linkable.map((b) => b.okey), BOOKING_KEY_CHUNK_SIZE).map((keys) =>
      this.readOnce<BookingLineModel>(BookingLineCollection, [
        ...getSystemQuery(this.env.tenantId),
        { key: 'accountingTenantId', operator: '==', value: invoice.accountingTenantId },
        { key: 'bookingKey', operator: 'in', value: keys },
      ], 'none')));
    return invoicePaymentCandidates(lineChunks.flat(), linkable, receivablesAccountKey, linked);
  }

  public async writeViaFunction(payload: WriteInvoicePayload): Promise<{ invoiceKey: string }> {
    const fn = httpsCallable<WriteInvoicePayload, { invoiceKey: string }>(getFunctions(getApp(), 'europe-west6'), 'writeInvoice');
    const result = await fn(payload);
    return result.data;
  }

  /** The positions of one invoice (live). */
  public listPositions(invoiceKey: string): Observable<InvoicePositionModel[]> {
    return this.firestoreService.searchData<InvoicePositionModel>(InvoicePositionCollection, this.positionsQuery(invoiceKey), 'none');
  }

  /**
   * One-shot, consistent read of an invoice's positions — what an edit form is seeded from. The live
   * stream may replay a cached snapshot from before the last server write.
   */
  public async listPositionsOnce(invoiceKey: string): Promise<InvoicePositionModel[]> {
    // Not FirestoreService.getDataOnce: it logs and returns [] on any error, which would look like
    // "no positions" — and saving the draft then would delete every stored position. Here a failed
    // read (permission, missing index, offline) rejects, so the caller can refuse to edit.
    const ref = query(
      collection(this.firestoreService.firestore, InvoicePositionCollection),
      ...getQuery(this.positionsQuery(invoiceKey), 'none'),
    );
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((d) => ({ ...d.data(), okey: d.id }) as InvoicePositionModel);
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

  private positionsQuery(invoiceKey: string): DbQuery[] {
    return [
      ...getSystemQuery(this.env.tenantId),
      { key: 'invoiceKey', operator: '==', value: invoiceKey },
    ];
  }

  private list(): Observable<InvoiceModel[]> {
    return this.firestoreService.searchData<InvoiceModel>(InvoiceCollection, getSystemQuery(this.env.tenantId), 'invoiceDate', 'desc');
  }
}
