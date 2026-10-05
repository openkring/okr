import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { BillCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo } from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen, touchedPeriodKeys } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { assertLeafAccount, refuse } from '../invoice/invoice-context';
import { isValidPaymentId, isValidStoreDate, linkDecision, paymentDecision } from '../invoice/invoice-payment.logic';
import { issuePeriodKeys, withoutUndefined } from '../invoice/invoice.logic';
import {
  applyBillPayment, BillLike, billLinkBlockers, billPaymentBlockers, billPaymentBookingLines, billPaymentNote, linkedPaymentKeys, StoredBillPayment,
  withNoteLine,
} from './bill-payment.logic';
import { isPeriodOpen, loadBillConfig, loadOwnBill, payablesKeyOf } from './bill-context';

const REGION = 'europe-west6';
const CF_NAME = 'recordBillPayment';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const MAX_NOTES_LENGTH = 2000;

interface RecordBillPaymentData {
  billKey?: string;
  mode?: 'post' | 'link';
  paymentId?: string;
  date?: string;
  amount?: number; // Rappen
  bankAccountKey?: string;
  bookingKey?: string;
}

interface RecordBillPaymentResult {
  state: string;
  payments: StoredBillPayment[];
  bookingKey: string;
}

type Doc = Record<string, unknown>;
type LineDoc = { accountKey: string; debitAmount?: { amount: number } | null; creditAmount?: { amount: number } | null; isArchived?: boolean };

const asBillLike = (bill: Doc): BillLike => ({
  state: String(bill['state'] ?? ''),
  totalAmount: bill['totalAmount'] as BillLike['totalAmount'],
  payments: (bill['payments'] as BillLike['payments']) ?? [],
  accountingTenantId: String(bill['accountingTenantId'] ?? ''),
  billDate: String(bill['billDate'] ?? ''),
});

const storedPayments = (bill: Doc): StoredBillPayment[] =>
  ((bill['payments'] as StoredBillPayment[] | undefined) ?? []).map((p) => withoutUndefined({
    date: p.date ?? '', amount: p.amount ?? 0, type: p.type ?? '', bookingKey: p.bookingKey ?? '', bankAccountKey: p.bankAccountKey,
  }));

/**
 * Record an outgoing payment on an open bill (spec 1.85 phase 1).
 *
 * `post`: books payables (debit) / bank (credit) as `bill-{key}-pay-{paymentId}` and appends the payment.
 * `link`: appends a payment that points at an existing posted booking which debits the payables
 * account (the DSL 09 case: a payment entered as a plain journal booking); nothing is booked, the
 * booking gets a note naming the bill and, without one, the bill's vendor as counterparty.
 * `paymentId` is the client's idempotency key, as in `recordInvoicePayment`. Everything is decided in
 * one transaction against the freshly read bill, so concurrent payments cannot overpay, and a booking
 * cannot be linked to two bills (all bills of the books are read inside the transaction).
 */
export const recordBillPayment = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<RecordBillPaymentData>): Promise<RecordBillPaymentResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { billKey, mode, paymentId } = request.data ?? {};
    if (typeof billKey !== 'string' || !billKey.trim()) throw new HttpsError('invalid-argument', 'billKey is required');
    if (mode !== 'post' && mode !== 'link') throw new HttpsError('invalid-argument', 'mode must be post or link');
    if (!isValidPaymentId(paymentId)) throw refuse('invalid-payment-id', 'paymentId must be 8 to 32 letters or digits');
    const amount = typeof request.data.amount === 'number' ? request.data.amount : Number.NaN;
    const date = isValidStoreDate(request.data.date) ? request.data.date : '';

    const db = getFirestore();
    const billRef = db.collection(BillCollection).doc(billKey);

    // ---- 1. bill, tenant, config (before the transaction) ----
    const pre = await loadOwnBill(db, tenantId, billKey);
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadBillConfig(db, tenantId, billKey, accountingTenantId);
    const payablesKey = payablesKeyOf(config, accountingTenantId);
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;

    let bookingKey: string;
    let bankAccountKey = '';
    let ccCtx: Awaited<ReturnType<typeof loadCostCenterContext>> | undefined;
    if (mode === 'post') {
      bankAccountKey = String(request.data.bankAccountKey ?? '');
      const allowed = (config['billPaymentAccountKeys'] as string[] | undefined) ?? [];
      if (!bankAccountKey || !allowed.includes(bankAccountKey)) {
        throw refuse('not-a-payment-account', `${bankAccountKey || '(none)'} is not a bill payment account of ${accountingTenantId}`);
      }
      await assertLeafAccount(db, accountingTenantId, bankAccountKey);
      bookingKey = `bill-${billKey}-pay-${paymentId}`;
      ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId, [payablesKey, bankAccountKey]);
    } else {
      bookingKey = String(request.data.bookingKey ?? '').trim();
      if (!bookingKey) throw new HttpsError('invalid-argument', 'bookingKey is required for mode link');
    }
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    // ---- 2. one transaction: reads, decision, writes ----
    const result = await db.runTransaction(async (tx) => {
      // reads (all before any write)
      const bill = (await tx.get(billRef)).data();
      if (!bill) throw new HttpsError('not-found', `bill ${billKey} not found`);
      if (String(bill['accountingTenantId'] ?? '') !== accountingTenantId || !((bill['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `bill ${billKey} changed while the payment was recorded`);
      }
      const existing = storedPayments(bill);
      const bookingSnap = await tx.get(bookingRef);

      const decision = mode === 'post' ? paymentDecision(existing, bookingKey) : linkDecision(existing, bookingKey, amount, date);
      if (decision === 'return-stored') return { state: String(bill['state'] ?? ''), payments: existing, bookingKey };

      const blockers = billPaymentBlockers(asBillLike(bill), amount, date);
      if (blockers.length > 0) {
        throw refuse('payment-blocked', `bill ${billKey} cannot take this payment: ${blockers.join(', ')}`, { reasons: blockers });
      }

      if (mode === 'link') {
        const booking = bookingSnap.exists ? (bookingSnap.data() as Doc) : undefined;
        const lineSnap = booking ? await tx.get(db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', bookingKey)) : undefined;
        const lines = (lineSnap?.docs ?? []).map((d) => d.data() as LineDoc);
        const books = await tx.get(db.collection(BillCollection).where('accountingTenantId', '==', accountingTenantId));
        const linkedElsewhere = linkedPaymentKeys(books.docs.map((d) => d.data() as { payments?: { bookingKey?: string }[] }));
        const linkProblems = billLinkBlockers(
          booking as { status?: string; accountingTenantId?: string; isArchived?: boolean; date?: string } | undefined, lines, payablesKey, accountingTenantId,
          amount, linkedElsewhere, bookingKey, String(bill['billDate'] ?? ''),
        );
        if (linkProblems.length > 0) {
          throw refuse('link-blocked', `booking ${bookingKey} cannot be linked: ${linkProblems.join(', ')}`, { reasons: linkProblems });
        }
        // the booking's note and counterparty are touched only in an open period (GebüV: closed books stay as they are)
        const bookingPeriodOpen = await isPeriodOpen(db, tx, touchedPeriodKeys(accountingTenantId, [String(booking?.['date'] ?? '')], fiscalYearStart));
        const applied = applyBillPayment(asBillLike(bill), { date, amount, bookingKey });
        tx.update(billRef, withoutUndefined({ payments: applied.payments, state: applied.state, paymentDate: applied.paymentDate }));
        if (!bookingPeriodOpen) return { state: applied.state, payments: applied.payments, bookingKey };
        const note = withNoteLine(String(booking?.['notes'] ?? ''), billPaymentNote(String(bill['billId'] ?? ''), String(bill['title'] ?? '')), MAX_NOTES_LENGTH);
        const counterparty = booking?.['counterparty'] as { key?: string; label?: string } | null | undefined;
        tx.update(bookingRef, withoutUndefined({
          notes: note,
          counterparty: !counterparty?.key && bill['vendor'] ? bill['vendor'] : undefined,
        }));
        return { state: applied.state, payments: applied.payments, bookingKey };
      }

      // post
      if (bookingSnap.exists) {
        throw refuse('inconsistent-state', `booking ${bookingKey} exists but bill ${billKey} does not carry it`);
      }
      await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, date, fiscalYearStart), tx);
      await assertLeafAccount(db, accountingTenantId, bankAccountKey, tx);
      await assertLeafAccount(db, accountingTenantId, payablesKey, tx);
      const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
      const bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(date.substring(0, 4)));

      // writes
      const tenants = (bill['tenants'] as string[] | undefined) ?? [tenantId];
      const billId = String(bill['billId'] ?? '');
      const title = `Zahlung Kreditor ${billId}`.trim();
      tx.set(bookingRef, withoutUndefined({
        tenants, accountingTenantId, isArchived: false,
        title, date, notes: `payment:${paymentId}`, tags: 'bill-payment', index: `d:${date} no:${bookingNo} n:${title}`,
        bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, date, fiscalYearStart),
        documentKeys: [], counterparty: bill['vendor'] ?? null,
      }));
      billPaymentBookingLines(payablesKey, bankAccountKey, amount).forEach((line, i) => {
        const costCenterKey = ccCtx ? costCenterKeyForLine(ccCtx, line.accountKey, { explicit: '' }) : '';
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
          tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
          ...(costCenterKey ? { costCenterKey } : {}),
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
        }));
      });
      const applied = applyBillPayment(asBillLike(bill), { date, amount, bookingKey, bankAccountKey });
      tx.update(billRef, withoutUndefined({ payments: applied.payments, state: applied.state, paymentDate: applied.paymentDate }));
      return { state: applied.state, payments: applied.payments, bookingKey };
    });
    logger.info(`${CF_NAME}: ${mode} payment on ${billKey} (tenant=${tenantId}, booking=${bookingKey})`);
    return result;
  },
);
