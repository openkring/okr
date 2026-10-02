import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { INVOICE_NOTES_LENGTH } from '@okr/finance-invoice-util';
import { InvoiceCollection } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo } from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { assertLeafAccount, loadOwnedAccountingConfig, refuse } from './invoice-context';
import { appendStornoNote, cancelBlockers, InvoiceLike, isValidStoreDate, reversalLines } from './invoice-payment.logic';
import { invoiceBookingIndex, issuePeriodKeys, withoutUndefined } from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'cancelInvoice';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const REASON_MAX = 500;

interface CancelInvoiceData {
  invoiceKey?: string;
  date?: string;
  reason?: string;
}

interface CancelInvoiceResult {
  state: 'cancelled';
  stornoBookingKey: string;
}

type Amount = { amount?: number } | null | undefined;
type IssueLine = { isArchived?: boolean; accountKey?: string; costCenterKey?: string; debitAmount?: Amount; creditAmount?: Amount };
type StornoLine = { accountKey: string; costCenterKey?: string; debitAmount?: { amount: number; currency: 'CHF' }; creditAmount?: { amount: number; currency: 'CHF' } };

const toAmount = (a: Amount): { amount: number; currency: 'CHF' } | undefined =>
  a && typeof a.amount === 'number' ? { amount: a.amount, currency: 'CHF' } : undefined;

/**
 * Cancel an issued, unpaid native invoice (spec 1.76, phase 2) by writing a reversal booking
 * `invoice-{key}-storno`: the issue booking's lines with debit and credit swapped, dated `date`. The
 * invoice becomes `cancelled` and gets a "[Storniert dd.MM.yyyy] reason" note. Migrated bexio invoices
 * (no okr issue booking) and invoices with payments are refused. A retry finds the storno booking
 * and the cancelled state and returns the stored result without writing.
 */
export const cancelInvoice = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<CancelInvoiceData>): Promise<CancelInvoiceResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { invoiceKey } = request.data ?? {};
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    const reason = typeof request.data.reason === 'string' ? request.data.reason.trim() : '';
    if (reason.length < 1 || reason.length > REASON_MAX) throw new HttpsError('invalid-argument', `reason is required (1 to ${REASON_MAX} characters)`);
    const date = request.data.date;
    if (!isValidStoreDate(date)) throw new HttpsError('invalid-argument', 'date must be a valid date (yyyyMMdd)');

    const db = getFirestore();
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

    // ---- 1. invoice, tenant, config (before the transaction) ----
    const pre = (await invoiceRef.get()).data();
    if (!pre) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    if (!((pre['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
    }
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadOwnedAccountingConfig(db, tenantId, invoiceKey, accountingTenantId, 'cancelled');
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;

    const stornoKey = `invoice-${invoiceKey}-storno`;
    const stornoRef = db.collection(BOOKING_COLLECTION).doc(stornoKey);
    const issueKey = `invoice-${invoiceKey}`;
    const issueRef = db.collection(BOOKING_COLLECTION).doc(issueKey);

    // ---- 2. one transaction: reads, decision, writes ----
    const result = await db.runTransaction(async (tx): Promise<CancelInvoiceResult> => {
      // reads (all before any write)
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `invoice ${invoiceKey} changed while it was cancelled`);
      }
      const stornoSnap = await tx.get(stornoRef);
      if (stornoSnap.exists) {
        if (invoice['state'] === 'cancelled') return { state: 'cancelled', stornoBookingKey: stornoKey };
        throw refuse('inconsistent-state', `booking ${stornoKey} exists but invoice ${invoiceKey} is not cancelled`);
      }
      const issueSnap = await tx.get(issueRef);
      const issueBookingExists = issueSnap.exists && issueSnap.data()?.['accountingTenantId'] === accountingTenantId;

      const blockers = cancelBlockers(
        {
          state: String(invoice['state'] ?? ''), totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'],
          payments: invoice['payments'] as InvoiceLike['payments'], accountingTenantId, bookingKey: invoice['bookingKey'] as string | undefined,
        },
        invoiceKey, issueBookingExists,
      );
      if (blockers.length > 0) {
        throw refuse('cancel-blocked', `invoice ${invoiceKey} cannot be cancelled: ${blockers.join(', ')}`, { reasons: blockers });
      }

      const lineSnap = await tx.get(db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', issueKey));
      const issueLines = lineSnap.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.data() as IssueLine).filter((l) => l.isArchived !== true);
      if (issueLines.length === 0) throw refuse('cancel-blocked', `invoice ${invoiceKey} has no issue booking lines`, { reasons: ['no-issue-booking'] });

      await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, date, fiscalYearStart), tx);
      for (const key of [...new Set(issueLines.map((l) => String(l.accountKey ?? '')))]) {
        await assertLeafAccount(db, accountingTenantId, key, tx);
      }
      const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
      const bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(date.substring(0, 4)));

      // writes
      const tenants = (invoice['tenants'] as string[] | undefined) ?? [tenantId];
      const invoiceId = String(invoice['invoiceId'] ?? '');
      const title = `Storno ${invoiceId}`;
      const documentKey = String(invoice['documentKey'] ?? '');
      tx.set(stornoRef, withoutUndefined({
        tenants, accountingTenantId, isArchived: false,
        title, date, notes: reason, tags: 'invoice-storno', index: invoiceBookingIndex(date, bookingNo, title, invoiceId),
        bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, date, fiscalYearStart),
        documentKeys: documentKey ? [documentKey] : [], counterparty: invoice['receiver'],
      }));
      const reversed = reversalLines<StornoLine>(issueLines.map((l) => ({
        accountKey: String(l.accountKey ?? ''),
        ...(l.costCenterKey ? { costCenterKey: l.costCenterKey } : {}),
        debitAmount: toAmount(l.debitAmount), creditAmount: toAmount(l.creditAmount),
      })));
      reversed.forEach((line, i) => {
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${stornoKey}-${i}`), withoutUndefined({
          tenants, accountingTenantId, isArchived: false, bookingKey: stornoKey, accountKey: line.accountKey,
          ...(line.costCenterKey ? { costCenterKey: line.costCenterKey } : {}),
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
        }));
      });
      const viewDate = convertDateFormatToString(date, DateFormat.StoreDate, DateFormat.ViewDate);
      const notes = appendStornoNote(String(invoice['notes'] ?? ''), viewDate, reason, INVOICE_NOTES_LENGTH);
      tx.update(invoiceRef, { state: 'cancelled', notes });
      return { state: 'cancelled', stornoBookingKey: stornoKey };
    });
    logger.info(`${CF_NAME}: cancelled ${invoiceKey} (tenant=${tenantId}, booking=${stornoKey})`);
    return result;
  },
);
