import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

import { InvoiceCollection } from '@okr/shared-models';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { allocateBookingNo } from '../booking/booking-no';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { chfText, historyDetails, writeFinanceHistory } from '../finance-history/finance-history';
import { assertLeafAccount, loadOwnedAccountingConfig, refuse } from './invoice-context';
import {
  applyInvoicePayment, InvoiceLike, isValidPaymentId, isValidStoreDate, paymentBlockers, paymentBookingLines, paymentDecision, StoredPayment,
} from './invoice-payment.logic';
import { invoiceBookingIndex, issuePeriodKeys, viewDate, withoutUndefined } from './invoice.logic';

/**
 * Server-side core of recording a payment on a native invoice (spec 1.76 phase 2): the `post` branch of
 * the recordInvoicePayment callable without its callable shell, so a webhook handler (Stripe, plan
 * 1.149) can record a payment too. The callers own authentication and roles; `tenantId` is the tenant
 * that owns the invoice, `actor` the uid (or a label like 'stripe') written to the finance history.
 */

export const BOOKING_COLLECTION = 'bookings';
export const BOOKING_LINE_COLLECTION = 'booking-lines';

export type InvoiceDoc = Record<string, unknown>;

export interface PostInvoicePaymentInput {
  tenantId: string;
  invoiceKey: string;
  paymentId: string;      // idempotency key: 8 to 32 letters or digits
  date: string;           // StoreDate; an invalid date is refused as `no-payment-date`
  amount: number;         // Rappen
  bankAccountKey: string; // must be one of the books' invoicePaymentAccountKeys
  actor: string;          // uid or a label like 'stripe'
}

export interface PostInvoicePaymentResult {
  state: string;
  bookingKey: string;
  /** true when this paymentId was already recorded: the stored result is returned, nothing is written. */
  duplicate: boolean;
  payments: StoredPayment[];
}

export function storedPayments(invoice: InvoiceDoc): StoredPayment[] {
  return ((invoice['payments'] as StoredPayment[] | undefined) ?? []).map((p) => ({
    date: p.date, amount: p.amount, bankAccountKey: p.bankAccountKey, bookingKey: p.bookingKey ?? '',
  }));
}

export const asInvoiceLike = (invoice: InvoiceDoc): InvoiceLike => ({
  state: String(invoice['state'] ?? ''),
  totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'],
  payments: invoice['payments'] as InvoiceLike['payments'],
  reminders: invoice['reminders'] as InvoiceLike['reminders'], // reminder fees raise the open amount (1.76 D14)
  accountingTenantId: String(invoice['accountingTenantId'] ?? ''),
});

export interface PaymentContext {
  invoiceRef: DocumentReference;
  accountingTenantId: string;
  config: Record<string, unknown>;
  receivablesKey: string;
  fiscalYearStart: number;
}

/** The invoice belongs to `tenantId` and its books are configured for payments here (before the transaction). */
export async function loadPaymentContext(db: Firestore, tenantId: string, invoiceKey: string): Promise<PaymentContext> {
  const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);
  const pre = (await invoiceRef.get()).data();
  if (!pre) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
  if (!((pre['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
  }
  const accountingTenantId = String(pre['accountingTenantId'] ?? '');
  const config = await loadOwnedAccountingConfig(db, tenantId, invoiceKey, accountingTenantId, 'paid');
  const receivablesKey = String(config['receivablesAccountKey'] ?? '');
  if (!receivablesKey) throw refuse('no-accounting-config', `${accountingTenantId} has no receivables account`);
  const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;
  return { invoiceRef, accountingTenantId, config, receivablesKey, fiscalYearStart };
}

/**
 * Books bank (debit) / receivables (credit) as `invoice-{key}-pay-{paymentId}` and appends the payment.
 * Idempotent on `paymentId`: a retry finds its payment already stored on the invoice and returns it with
 * `duplicate: true` without writing. Everything is decided inside one transaction against the freshly
 * read invoice, so concurrent payments cannot overpay.
 */
export async function postInvoicePayment(db: Firestore, input: PostInvoicePaymentInput): Promise<PostInvoicePaymentResult> {
  const { tenantId, invoiceKey, paymentId, amount, bankAccountKey, actor } = input;
  if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
  if (!isValidPaymentId(paymentId)) throw refuse('invalid-payment-id', 'paymentId must be 8 to 32 letters or digits');
  const date = isValidStoreDate(input.date) ? input.date : '';

  // ---- 1. invoice, tenant, config, payment account (before the transaction) ----
  const { invoiceRef, accountingTenantId, config, receivablesKey, fiscalYearStart } = await loadPaymentContext(db, tenantId, invoiceKey);
  const allowed = (config['invoicePaymentAccountKeys'] as string[] | undefined) ?? [];
  if (!bankAccountKey || !allowed.includes(bankAccountKey)) {
    throw refuse('not-a-payment-account', `${bankAccountKey || '(none)'} is not a payment account of ${accountingTenantId}`);
  }
  await assertLeafAccount(db, accountingTenantId, bankAccountKey);
  const bookingKey = `invoice-${invoiceKey}-pay-${paymentId}`;
  const ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId, [bankAccountKey, receivablesKey]);
  const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

  // ---- 2. one transaction: reads, decision, writes ----
  const result = await db.runTransaction(async (tx): Promise<PostInvoicePaymentResult> => {
    // reads (all before any write)
    const invoice = (await tx.get(invoiceRef)).data();
    if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw refuse('state-changed', `invoice ${invoiceKey} changed while the payment was recorded`);
    }
    const existing = ((invoice['payments'] as StoredPayment[] | undefined) ?? []);
    const bookingSnap = await tx.get(bookingRef);

    if (paymentDecision(existing, bookingKey) === 'return-stored') {
      return { state: String(invoice['state'] ?? ''), payments: storedPayments(invoice), bookingKey, duplicate: true };
    }

    const blockers = paymentBlockers(asInvoiceLike(invoice), amount, date);
    if (blockers.length > 0) {
      throw refuse('payment-blocked', `invoice ${invoiceKey} cannot take this payment: ${blockers.join(', ')}`, { reasons: blockers });
    }
    if (bookingSnap.exists) {
      throw refuse('inconsistent-state', `booking ${bookingKey} exists but invoice ${invoiceKey} does not carry it`);
    }
    await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, date, fiscalYearStart), tx);
    await assertLeafAccount(db, accountingTenantId, bankAccountKey, tx);
    await assertLeafAccount(db, accountingTenantId, receivablesKey, tx);
    const bookingNo = await allocateBookingNo(db, tx, accountingTenantId, Number(date.substring(0, 4)));

    // writes
    const tenants = (invoice['tenants'] as string[] | undefined) ?? [tenantId];
    const invoiceId = String(invoice['invoiceId'] ?? '');
    const title = `Zahlung Rechnung ${invoiceId}`;
    tx.set(bookingRef, withoutUndefined({
      tenants, accountingTenantId, isArchived: false,
      title, date, notes: `payment:${paymentId}`, tags: 'invoice-payment', index: invoiceBookingIndex(date, bookingNo, title, invoiceId),
      bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, date, fiscalYearStart),
      documentKeys: invoice['documentKey'] ? [String(invoice['documentKey'])] : [], counterparty: invoice['receiver'],
    }));
    paymentBookingLines(bankAccountKey, receivablesKey, amount).forEach((line, i) => {
      const costCenterKey = costCenterKeyForLine(ccCtx, line.accountKey, { explicit: '' });
      tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
        tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
        ...(costCenterKey ? { costCenterKey } : {}),
        ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
        ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
      }));
    });
    const applied = applyInvoicePayment(asInvoiceLike(invoice), { paymentId, date, amount, bankAccountKey, bookingKey });
    tx.update(invoiceRef, withoutUndefined({ payments: applied.payments, state: applied.state, paymentDate: applied.paymentDate }));
    return { state: applied.state, payments: applied.payments, bookingKey, duplicate: false };
  });
  // a duplicate wrote nothing, so it adds no Verlauf entry either
  if (!result.duplicate) {
    await writeFinanceHistory(db, { tenantId, uid: actor, parentKey: `invoice.${invoiceKey}`, kind: 'payment', details: historyDetails(chfText(amount), viewDate(date)) });
  }
  return result;
}
