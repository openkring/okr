import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { refuse } from './invoice-context';
import {
  applyInvoicePayment, isValidPaymentId, isValidStoreDate, linkBlockers, linkDecision, paymentBlockers, pickBankAccount, StoredPayment,
} from './invoice-payment.logic';
import { asInvoiceLike, BOOKING_COLLECTION, BOOKING_LINE_COLLECTION, InvoiceDoc, loadPaymentContext, postInvoicePayment, storedPayments } from './invoice-payment.core';
import { viewDate, withoutUndefined } from './invoice.logic';
import { chfText, historyDetails, writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'recordInvoicePayment';

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

type LineDoc = { accountKey: string; debitAmount?: { amount: number } | null; creditAmount?: { amount: number } | null; isArchived?: boolean };

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

    if (mode === 'post') {
      // the server-side core (invoice-payment.core.ts), shared with the Stripe webhook handler
      const { state, payments, bookingKey } = await postInvoicePayment(db, {
        tenantId, invoiceKey, paymentId, date, amount, bankAccountKey: String(request.data.bankAccountKey ?? ''), actor: request.auth?.uid ?? '',
      });
      logger.info(`${CF_NAME}: post payment on ${invoiceKey} (tenant=${tenantId}, booking=${bookingKey})`);
      return { state, payments, bookingKey };
    }

    // ---- link: 1. invoice, tenant, config (before the transaction) ----
    const { invoiceRef, accountingTenantId, config, receivablesKey } = await loadPaymentContext(db, tenantId, invoiceKey);
    const bookingKey = String(request.data.bookingKey ?? '').trim();
    if (!bookingKey) throw new HttpsError('invalid-argument', 'bookingKey is required for mode link');
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    // ---- 2. one transaction: reads, decision, writes ----
    const result = await db.runTransaction(async (tx): Promise<RecordInvoicePaymentResult> => {
      // reads (all before any write)
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `invoice ${invoiceKey} changed while the payment was recorded`);
      }
      const existing = ((invoice['payments'] as StoredPayment[] | undefined) ?? []);
      const bookingSnap = await tx.get(bookingRef);

      if (linkDecision(existing, bookingKey, amount, date) === 'return-stored') {
        return { state: String(invoice['state'] ?? ''), payments: storedPayments(invoice), bookingKey };
      }

      const blockers = paymentBlockers(asInvoiceLike(invoice), amount, date);
      if (blockers.length > 0) {
        throw refuse('payment-blocked', `invoice ${invoiceKey} cannot take this payment: ${blockers.join(', ')}`, { reasons: blockers });
      }

      const booking = bookingSnap.exists ? (bookingSnap.data() as InvoiceDoc) : undefined;
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
    });
    await writeFinanceHistory(db, { tenantId, uid: request.auth?.uid, parentKey: `invoice.${invoiceKey}`, kind: 'payment', details: historyDetails(chfText(amount), viewDate(date), `↔ ${bookingKey}`) });
    logger.info(`${CF_NAME}: ${mode} payment on ${invoiceKey} (tenant=${tenantId}, booking=${bookingKey})`);
    return result;
  },
);
