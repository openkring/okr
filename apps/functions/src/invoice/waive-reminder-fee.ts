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
import { appendNote, InvoiceLike, isUsableIssueBooking, openAmount, reversalLines, waiverOutcome } from './invoice-payment.logic';
import { coalesceReminder, reminderKey, ReminderLike, storedReminder, waiveBlockers, waiverKey } from './invoice-reminder.logic';
import { invoiceBookingIndex, issuePeriodKeys, withoutUndefined } from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'waiveReminderFee';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';

interface WaiveReminderFeeData {
  invoiceKey?: string;
  level?: number;
  date?: string;
  reason?: string;
}

interface WaiveReminderFeeResult {
  reminder: ReminderLike;
  openAmount: number;
  state: string;
}

type Doc = Record<string, unknown>;
type Amount = { amount?: number } | null | undefined;
type FeeLine = { isArchived?: boolean; accountKey?: string; costCenterKey?: string; debitAmount?: Amount; creditAmount?: Amount };
type WaiverLine = { accountKey: string; costCenterKey?: string; debitAmount?: { amount: number; currency: 'CHF' }; creditAmount?: { amount: number; currency: 'CHF' } };

const toAmount = (a: Amount): { amount: number; currency: 'CHF' } | undefined =>
  a && typeof a.amount === 'number' ? { amount: a.amount, currency: 'CHF' } : undefined;

const asInvoiceLike = (invoice: Doc): InvoiceLike => ({
  state: String(invoice['state'] ?? ''),
  totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'],
  payments: invoice['payments'] as InvoiceLike['payments'],
  accountingTenantId: String(invoice['accountingTenantId'] ?? ''),
  reminders: invoice['reminders'] as InvoiceLike['reminders'],
});

const reminderAsLike = (invoice: Doc) => ({ state: String(invoice['state'] ?? ''), reminders: invoice['reminders'] as ReminderLike[] | undefined });

const storedResult = (invoice: Doc, stored: ReminderLike): WaiveReminderFeeResult => ({
  reminder: coalesceReminder(stored), openAmount: openAmount(asInvoiceLike(invoice)), state: String(invoice['state'] ?? ''),
});

/**
 * Waive the fee of reminder `level` (spec 1.76 D18): writes the booking
 * `invoice-{key}-reminder-{level}-waiver` (the fee booking's lines with debit and credit swapped, dated
 * `date`), marks the reminder `waivedAt` / `waiveBookingKey`, appends "[Gebühr erlassen dd.MM.yyyy] reason"
 * to the notes and flips a payable invoice to `paid` when the payments cover total plus the remaining
 * fees. The reminder PDF stays as sent. A retry finds `waiveBookingKey` and returns the stored result.
 */
export const waiveReminderFee = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 60 },
  async (request: CallableRequest<WaiveReminderFeeData>): Promise<WaiveReminderFeeResult> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const { invoiceKey, level, date } = request.data ?? {};
    if (typeof invoiceKey !== 'string' || !invoiceKey.trim()) throw new HttpsError('invalid-argument', 'invoiceKey is required');
    if (!Number.isInteger(level) || (level as number) < 1) throw new HttpsError('invalid-argument', 'level must be a positive integer');
    const lvl = level as number;
    const dateStr = typeof date === 'string' ? date : '';
    const reason = typeof request.data.reason === 'string' ? request.data.reason.trim() : '';

    const db = getFirestore();
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

    // ---- 1. invoice, tenant, config (before the transaction) ----
    const pre = (await invoiceRef.get()).data();
    if (!pre) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
    if (!((pre['tenants'] as string[] | undefined) ?? []).includes(tenantId)) throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadOwnedAccountingConfig(db, tenantId, invoiceKey, accountingTenantId, 'waived');

    // idempotency before the blockers and config checks: a retry returns the stored result even after a config change
    // (tenant ownership and the bexio guard in loadOwnedAccountingConfig run first, by design)
    const already = storedReminder(pre['reminders'] as ReminderLike[] | undefined, lvl);
    if (already?.waiveBookingKey) return storedResult(pre, already);

    const blockers = waiveBlockers(reminderAsLike(pre), lvl, dateStr, reason);
    if (blockers.length > 0) {
      throw refuse('waive-blocked', `invoice ${invoiceKey} cannot waive the fee of reminder ${lvl}: ${blockers.join(', ')}`, { reasons: blockers });
    }
    const receivablesKey = String(config['receivablesAccountKey'] ?? '');
    const feeAccountKey = String(config['reminderFeeAccountKey'] ?? '');
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;
    if (!feeAccountKey) throw refuse('no-reminder-fee-account', `${accountingTenantId} has no reminder fee account`);
    if (!receivablesKey) throw refuse('no-receivables-account', `${accountingTenantId} has no receivables account`);
    await assertLeafAccount(db, accountingTenantId, feeAccountKey);
    await assertLeafAccount(db, accountingTenantId, receivablesKey);
    await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, dateStr, fiscalYearStart));

    const key = waiverKey(invoiceKey, lvl);
    const waiverRef = db.collection(BOOKING_COLLECTION).doc(key);

    // ---- 2. one transaction: reads, decision, writes ----
    const result = await db.runTransaction(async (tx): Promise<WaiveReminderFeeResult> => {
      const invoice = (await tx.get(invoiceRef)).data();
      if (!invoice) throw new HttpsError('not-found', `invoice ${invoiceKey} not found`);
      if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !((invoice['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `invoice ${invoiceKey} changed while the fee was waived`);
      }
      const stored = storedReminder(invoice['reminders'] as ReminderLike[] | undefined, lvl);
      if (stored?.waiveBookingKey) return storedResult(invoice, stored);
      const fresh = waiveBlockers(reminderAsLike(invoice), lvl, dateStr, reason);
      if (fresh.length > 0) {
        throw refuse('waive-blocked', `invoice ${invoiceKey} cannot waive the fee of reminder ${lvl}: ${fresh.join(', ')}`, { reasons: fresh });
      }
      const reminder = stored as ReminderLike; // waiveBlockers proved it exists
      const feeKey = reminder.bookingKey ?? reminderKey(invoiceKey, lvl);

      const waiverSnap = await tx.get(waiverRef);
      if (waiverSnap.exists) throw refuse('inconsistent-state', `booking ${key} exists but reminder ${lvl} of invoice ${invoiceKey} is not waived`);
      const feeSnap = await tx.get(db.collection(BOOKING_COLLECTION).doc(feeKey));
      const feeBooking = feeSnap.exists ? (feeSnap.data() as { status?: string; accountingTenantId?: string; isArchived?: boolean }) : undefined;
      if (!isUsableIssueBooking(feeBooking, accountingTenantId)) {
        throw refuse('no-fee-booking', `fee booking ${feeKey} of invoice ${invoiceKey} is missing, not posted, archived or in other books`);
      }
      const lineSnap = await tx.get(db.collection(BOOKING_LINE_COLLECTION).where('bookingKey', '==', feeKey));
      const feeLines = lineSnap.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.data() as FeeLine).filter((l) => l.isArchived !== true);
      if (feeLines.length === 0) throw refuse('no-fee-booking', `fee booking ${feeKey} of invoice ${invoiceKey} has no lines`);

      await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, dateStr, fiscalYearStart), tx);
      for (const accountKey of [...new Set(feeLines.map((l) => String(l.accountKey ?? '')))]) {
        await assertLeafAccount(db, accountingTenantId, accountKey, tx);
      }
      const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
      const bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(dateStr.substring(0, 4)));

      // writes
      const tenants = (invoice['tenants'] as string[] | undefined) ?? [tenantId];
      const invoiceId = String(invoice['invoiceId'] ?? invoiceKey);
      const title = `Mahngebühr erlassen ${invoiceId} (${lvl}. Mahnung)`;
      tx.set(waiverRef, withoutUndefined({
        tenants, accountingTenantId, isArchived: false,
        title, date: dateStr, notes: reason, tags: 'invoice-reminder-waiver', index: invoiceBookingIndex(dateStr, bookingNo, title, invoiceId),
        bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, dateStr, fiscalYearStart),
        documentKeys: reminder.documentKey ? [reminder.documentKey] : [], counterparty: invoice['receiver'],
      }));
      const toWaiverLine = (l: FeeLine): WaiverLine => ({
        accountKey: String(l.accountKey ?? ''),
        ...(l.costCenterKey ? { costCenterKey: l.costCenterKey } : {}),
        debitAmount: toAmount(l.debitAmount), creditAmount: toAmount(l.creditAmount),
      });
      reversalLines(feeLines.map(toWaiverLine)).forEach((line, i) => {
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${key}-${i}`), withoutUndefined({
          tenants, accountingTenantId, isArchived: false, bookingKey: key, accountKey: line.accountKey,
          ...(line.costCenterKey ? { costCenterKey: line.costCenterKey } : {}),
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
        }));
      });
      const waived = coalesceReminder({ ...reminder, waivedAt: dateStr, waiveBookingKey: key });
      const reminders = ((invoice['reminders'] as ReminderLike[] | undefined) ?? []).map((r) => (r.level === lvl ? waived : coalesceReminder(r)));
      const viewDate = convertDateFormatToString(dateStr, DateFormat.StoreDate, DateFormat.ViewDate);
      const notes = appendNote(String(invoice['notes'] ?? ''), 'Gebühr erlassen', viewDate, reason, INVOICE_NOTES_LENGTH);
      const outcome = waiverOutcome({ ...asInvoiceLike(invoice), reminders });
      tx.update(invoiceRef, withoutUndefined({
        reminders, notes, ...(outcome.state !== invoice['state'] ? { state: outcome.state, paymentDate: outcome.paymentDate } : {}),
      }));
      return { reminder: waived, openAmount: openAmount({ ...asInvoiceLike(invoice), reminders }), state: outcome.state };
    });
    logger.info(`${CF_NAME}: waived fee of reminder ${lvl} on ${invoiceKey} (tenant=${tenantId}, booking=${key})`);
    return result;
  },
);
