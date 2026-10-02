import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo } from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { assertLeafAccount, loadOwnedAccountingConfig, refuse } from './invoice-context';
import {
  applyInvoicePayment, InvoiceLike, isValidPaymentId, isValidStoreDate, linkBlockers, linkDecision, paymentBlockers, paymentBookingLines,
  paymentDecision, pickBankAccount, StoredPayment,
} from './invoice-payment.logic';
import { invoiceBookingIndex, issuePeriodKeys, withoutUndefined } from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'recordInvoicePayment';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';

interface RecordInvoicePaymentData {
  invoiceKey?: string;
  mode?: 'post' | 'link';
  paymentId?: string;
  date?: string;
  amount?: number; // Rappen
  bankAccountKey?: string;
  bookingKey?: string;
}

interface RecordInvoicePaymentResult {
  state: string;
  payments: StoredPayment[];
  bookingKey: string;
}

type Doc = Record<string, unknown>;
type LineDoc = { accountKey: string; debitAmount?: { amount: number } | null; creditAmount?: { amount: number } | null; isArchived?: boolean };

function storedResult(invoice: Doc, bookingKey: string): RecordInvoicePaymentResult {
  const payments = ((invoice['payments'] as StoredPayment[] | undefined) ?? []).map((p) => ({
    date: p.date, amount: p.amount, bankAccountKey: p.bankAccountKey, bookingKey: p.bookingKey ?? '',
  }));
  return { state: String(invoice['state'] ?? ''), payments, bookingKey };
}

const asInvoiceLike = (invoice: Doc): InvoiceLike => ({
  state: String(invoice['state'] ?? ''),
  totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'],
  payments: invoice['payments'] as InvoiceLike['payments'],
  accountingTenantId: String(invoice['accountingTenantId'] ?? ''),
});

/**
 * Record a received payment on an issued native invoice (spec 1.76, phase 2).
 *
 * `post`: books bank (debit) / receivables (credit) as `invoice-{key}-pay-{paymentId}` and appends the
 * payment. `link`: appends a payment that points at an existing posted bank booking; nothing is booked.
 * `paymentId` is the client's idempotency key: a retry (double click, resent call) finds its payment
 * already stored on the invoice and returns it without writing. Everything is decided inside one
 * transaction against the freshly read invoice, so concurrent payments cannot overpay.
 */
export const recordInvoicePayment = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<RecordInvoicePaymentData>): Promise<RecordInvoicePaymentResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { invoiceKey, mode, paymentId } = request.data ?? {};
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    if (mode !== 'post' && mode !== 'link') throw new HttpsError('invalid-argument', 'mode must be post or link');
    if (!isValidPaymentId(paymentId)) throw refuse('invalid-payment-id', 'paymentId must be 8 to 32 letters or digits');
    const amount = typeof request.data.amount === 'number' ? request.data.amount : Number.NaN;
    const date = isValidStoreDate(request.data.date) ? request.data.date : '';

    const db = getFirestore();
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

    // ---- 1. invoice, tenant, config (before the transaction) ----
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

    let bookingKey: string;
    let bankAccountKey = '';
    let ccCtx: Awaited<ReturnType<typeof loadCostCenterContext>> | undefined;
    if (mode === 'post') {
      bankAccountKey = String(request.data.bankAccountKey ?? '');
      const allowed = (config['invoicePaymentAccountKeys'] as string[] | undefined) ?? [];
      if (!bankAccountKey || !allowed.includes(bankAccountKey)) {
        throw refuse('not-a-payment-account', `${bankAccountKey || '(none)'} is not a payment account of ${accountingTenantId}`);
      }
      await assertLeafAccount(db, accountingTenantId, bankAccountKey);
      bookingKey = `invoice-${invoiceKey}-pay-${paymentId}`;
      ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId, [bankAccountKey, receivablesKey]);
    } else {
      bookingKey = String(request.data.bookingKey ?? '').trim();
      if (!bookingKey) throw new HttpsError('invalid-argument', 'bookingKey is required for mode link');
    }
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    // ---- 2. one transaction: reads, decision, writes ----
    const result = await db.runTransaction(async (tx) => {
      // reads (all before any write)
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `invoice ${invoiceKey} changed while the payment was recorded`);
      }
      const existing = ((invoice['payments'] as StoredPayment[] | undefined) ?? []);
      const bookingSnap = await tx.get(bookingRef);

      const decision = mode === 'post' ? paymentDecision(existing, bookingKey) : linkDecision(existing, bookingKey, amount, date);
      if (decision === 'return-stored') return storedResult(invoice, bookingKey);

      const blockers = paymentBlockers(asInvoiceLike(invoice), amount, date);
      if (blockers.length > 0) {
        throw refuse('payment-blocked', `invoice ${invoiceKey} cannot take this payment: ${blockers.join(', ')}`, { reasons: blockers });
      }

      if (mode === 'link') {
        const booking = bookingSnap.exists ? (bookingSnap.data() as Doc) : undefined;
        const lineSnap = booking ? await tx.get(db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', bookingKey)) : undefined;
        const lines = (lineSnap?.docs ?? []).map((d) => d.data() as LineDoc);
        const linkProblems = linkBlockers(
          booking as { status?: string; accountingTenantId?: string; isArchived?: boolean } | undefined, lines, receivablesKey, accountingTenantId, amount,
          existing.map((p) => p.bookingKey), bookingKey,
        );
        if (linkProblems.length > 0) {
          throw refuse('link-blocked', `booking ${bookingKey} cannot be linked: ${linkProblems.join(', ')}`, { reasons: linkProblems });
        }
        const linkedBank = pickBankAccount(lines.filter((l) => l.isArchived !== true), (config['invoicePaymentAccountKeys'] as string[] | undefined) ?? []);
        if (!linkedBank) throw refuse('no-bank-line', `booking ${bookingKey} has no debit line to take the bank account from`);
        const applied = applyInvoicePayment(asInvoiceLike(invoice), { paymentId, date, amount, bankAccountKey: linkedBank, bookingKey });
        tx.update(invoiceRef, withoutUndefined({ payments: applied.payments, state: applied.state, paymentDate: applied.paymentDate }));
        return { state: applied.state, payments: applied.payments, bookingKey };
      }

      // post
      if (bookingSnap.exists) {
        throw refuse('inconsistent-state', `booking ${bookingKey} exists but invoice ${invoiceKey} does not carry it`);
      }
      await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, date, fiscalYearStart), tx);
      await assertLeafAccount(db, accountingTenantId, bankAccountKey, tx);
      await assertLeafAccount(db, accountingTenantId, receivablesKey, tx);
      const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
      const bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(date.substring(0, 4)));

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
        const costCenterKey = ccCtx ? costCenterKeyForLine(ccCtx, line.accountKey, { explicit: '' }) : '';
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
          tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
          ...(costCenterKey ? { costCenterKey } : {}),
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
        }));
      });
      const applied = applyInvoicePayment(asInvoiceLike(invoice), { paymentId, date, amount, bankAccountKey, bookingKey });
      tx.update(invoiceRef, withoutUndefined({ payments: applied.payments, state: applied.state, paymentDate: applied.paymentDate }));
      return { state: applied.state, payments: applied.payments, bookingKey };
    });
    logger.info(`${CF_NAME}: ${mode} payment on ${invoiceKey} (tenant=${tenantId}, booking=${bookingKey})`);
    return result;
  },
);
