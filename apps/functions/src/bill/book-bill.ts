import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { BillCollection } from '@okr/shared-models';
import { projectKeyForLine } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, isBalanced, nextBookingNo } from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { assertExplicitCostCenter, costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { assertLeafAccount, refuse } from '../invoice/invoice-context';
import { issuePeriodKeys, withoutUndefined } from '../invoice/invoice.logic';
import { billBookingLines, BillLineInput, bookBlockers } from './bill.logic';
import { loadBillConfig, loadOwnBill } from './bill-context';
import { assertProjectKeyShapes, assertProjectsAssignable } from '../project/project-context';
import { writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'bookBill';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';

/**
 * Books a draft bill (spec 1.85 phase 3): writes the issue booking `bill-{key}` — one debit per bill
 * line on its expense account (with its VAT code and Kostenstelle), one credit on the payables account
 * for the total — dated the bill date (Kostenstelle and Kostenträger per debit line, the payables line carries none), and sets the bill to `todo`. `bookingNo` is assigned inside the
 * transaction; the period lock is checked. Idempotent: a bill already carrying its booking returns it.
 * Deleting the booking in the journal returns the bill to `draft` (writeBooking clean-up).
 */
export const bookBill = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ billKey?: string }>): Promise<{ bookingKey: string; bookingNo: number; state: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const billKey = request.data?.billKey;
    if (typeof billKey !== 'string' || !billKey.trim()) throw new HttpsError('invalid-argument', 'billKey is required');
    const bookingKey = `bill-${billKey}`;

    const db = getFirestore();
    const billRef = db.collection(BillCollection).doc(billKey);
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    // ---- plain reads before the transaction ----
    const pre = await loadOwnBill(db, tenantId, billKey);
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadBillConfig(db, tenantId, billKey, accountingTenantId);
    const payablesKey = String(config['payablesAccountKey'] ?? '');
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;
    if (((pre['bookingKeys'] as string[] | undefined) ?? []).includes(bookingKey)) {
      const booking = (await bookingRef.get()).data();
      return { bookingKey, bookingNo: Number(booking?.['bookingNo'] ?? 0), state: String(pre['state'] ?? '') };
    }
    const preLines = (pre['lines'] as BillLineInput[] | undefined) ?? [];
    const ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId, [...preLines.map((l) => l.accountKey), payablesKey].filter((k) => !!k));

    // Kostenträger (spec 1.92 D2): plain reads before the transaction, like writeBooking; the lines are re-checked against this set inside it
    assertProjectKeyShapes(preLines);
    await assertProjectsAssignable(db, tenantId, preLines);
    const checkedProjectKeys = new Set(preLines.map((l) => (l.projectKey ?? '').trim()).filter((k) => !!k));

    const result = await db.runTransaction(async (tx) => {
      // reads (all before any write)
      const bill = (await tx.get(billRef)).data();
      if (!bill) throw new HttpsError('not-found', `bill ${billKey} not found`);
      if (String(bill['accountingTenantId'] ?? '') !== accountingTenantId || !((bill['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `bill ${billKey} changed while it was booked`);
      }
      const lines = (bill['lines'] as BillLineInput[] | undefined) ?? [];
      const billDate = String(bill['billDate'] ?? '');
      const blockers = bookBlockers({ state: String(bill['state'] ?? ''), lines, billDate, bookingKeys: bill['bookingKeys'] as string[] | undefined }, payablesKey);
      if (blockers.length > 0) throw refuse('book-blocked', `bill ${billKey} cannot be booked: ${blockers.join(', ')}`, { reasons: blockers });
      if ((await tx.get(bookingRef)).exists) throw refuse('inconsistent-state', `booking ${bookingKey} exists but bill ${billKey} does not carry it`);

      await assertPeriodsOpen(db, issuePeriodKeys(accountingTenantId, billDate, fiscalYearStart), tx);
      for (const accountKey of new Set([...lines.map((l) => l.accountKey), payablesKey])) {
        await assertLeafAccount(db, accountingTenantId, accountKey, tx);
      }
      for (const l of lines) assertExplicitCostCenter(ccCtx, l.accountKey, l.costCenterKey, new Set());
      if (lines.some((l) => !!(l.projectKey ?? '').trim() && !checkedProjectKeys.has((l.projectKey ?? '').trim()))) {
        throw refuse('state-changed', `bill ${billKey} changed while it was booked`);
      }
      const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
      const bookingNo = nextBookingNo(ledger.docs.map((s) => s.data() as { date?: string; bookingNo?: number }), Number(billDate.substring(0, 4)));

      const bookingLines = billBookingLines(lines, payablesKey);
      if (!isBalanced(bookingLines)) throw refuse('inconsistent-state', `booking ${bookingKey} is not balanced`);

      // writes
      const tenants = (bill['tenants'] as string[] | undefined) ?? [tenantId];
      const billId = String(bill['billId'] ?? '');
      const title = `Kreditor ${[billId, String(bill['title'] ?? '')].filter((s) => !!s).join(' ')}`.slice(0, 200);
      tx.set(bookingRef, withoutUndefined({
        tenants, accountingTenantId, isArchived: false,
        title, date: billDate, notes: '', tags: 'bill', index: `d:${billDate} no:${bookingNo} n:${title}`,
        bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, billDate, fiscalYearStart),
        documentKeys: ((bill['attachments'] as string[] | undefined) ?? []).filter((a) => a.startsWith('bexio-file-') || a.startsWith('bill-')),
        counterparty: bill['vendor'] ?? null,
      }));
      bookingLines.forEach((line, i) => {
        const costCenterKey = costCenterKeyForLine(ccCtx, line.accountKey, { explicit: line.costCenterKey ?? '' });
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
          tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
          ...(costCenterKey ? { costCenterKey } : {}),
          projectKey: projectKeyForLine(ccCtx.accounts, line),
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
          ...(line.vatCodeKey ? { vatCodeKey: line.vatCodeKey } : {}),
          ...(line.description ? { description: line.description } : {}),
        }));
      });
      tx.update(billRef, { state: 'todo', bookingKeys: [bookingKey] });
      return { bookingKey, bookingNo, state: 'todo' };
    });
    await writeFinanceHistory(db, { tenantId, uid: request.auth?.uid, parentKey: `bill.${billKey}`, kind: 'billBooked', details: String(result.bookingNo) });
    logger.info(`${CF_NAME}: booked ${billKey} as ${bookingKey} (no=${result.bookingNo}, tenant=${tenantId})`);
    return result;
  },
);
