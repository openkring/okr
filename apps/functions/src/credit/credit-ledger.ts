// apps/functions/src/credit/credit-ledger.ts
//
// The prepaid credit ledger: one transaction reads the account (created at 0 on first use), decides, and
// writes account + entry + booking. Idempotent on entryId. A deduction never takes the balance below 0.
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { CreditAccountCollection, CreditAccountModel, CreditEntrySubcollection } from '@okr/shared-models';
import type { CreditEntry } from '@okr/shared-models';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { allocateBookingNo } from '../booking/booking-no';
import { assertPeriodsOpen, touchedPeriodKeys } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { assertLeafAccount, loadOwnedAccountingConfig, refuse } from '../invoice/invoice-context';
import { BOOKING_COLLECTION, BOOKING_LINE_COLLECTION } from '../invoice/invoice-payment.core';
import { withoutUndefined } from '../invoice/invoice.logic';
import { platformBilling } from '../collection/platform';
import { creditBookingKey, creditBookingLines, creditDecision } from './credit.logic';

export type CreditEntryInput = Omit<CreditEntry, 'balanceAfter' | 'bookingKey'>;

interface BookingContext {
  operatorTenantId: string;
  accountingTenantId: string;
  prepaymentKey: string;
  revenueKey: string;
  fiscalYearStart: number;
  ccCtx: Awaited<ReturnType<typeof loadCostCenterContext>>;
}

/** Operator books and account keys for an entry that is booked; refuses (nothing written) when they are missing. */
async function loadBookingContext(db: Firestore, entry: CreditEntryInput): Promise<BookingContext> {
  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const config = await loadOwnedAccountingConfig(db, operatorTenantId, entry.reference, accountingTenantId, 'booked');
  const prepaymentKey = String(config['prepaymentAccountKey'] ?? '');
  const revenueKey = String(config['transactionRevenueAccountKey'] ?? '');
  if (!prepaymentKey || !revenueKey) {
    throw refuse('credit-accounts-missing', `${accountingTenantId} has no prepaymentAccountKey / transactionRevenueAccountKey: credit is not set up`);
  }
  const ccCtx = await loadCostCenterContext(db, operatorTenantId, accountingTenantId, [prepaymentKey, revenueKey]);
  return { operatorTenantId, accountingTenantId, prepaymentKey, revenueKey, fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1, ccCtx };
}

export async function applyCreditEntry(
  db: Firestore, tenantId: string, entryId: string, entry: CreditEntryInput,
): Promise<{ balanceAfter: number; duplicate: boolean }> {
  const accountRef = db.collection(CreditAccountCollection).doc(tenantId);
  const entryRef = accountRef.collection(CreditEntrySubcollection).doc(entryId);
  const booked = creditBookingLines(entry.kind, entry.amount, 'p', 'r') !== null;
  const ctx = booked ? await loadBookingContext(db, entry) : undefined;
  const date = entry.date.substring(0, 8);

  return db.runTransaction(async tx => {
    // all reads first
    const existing = await tx.get(entryRef);
    if (existing.exists) return { balanceAfter: Number((existing.data() ?? {})['balanceAfter'] ?? 0), duplicate: true };
    const account = await tx.get(accountRef);
    const balance = account.exists ? Number((account.data() ?? {})['balance'] ?? 0) : 0;
    const decision = creditDecision(balance, entry.amount);
    if (!decision.ok) throw new HttpsError('failed-precondition', decision.reason);

    let bookingNo = 0;
    if (ctx) {
      await assertPeriodsOpen(db, touchedPeriodKeys(ctx.accountingTenantId, [date], ctx.fiscalYearStart), tx);
      await assertLeafAccount(db, ctx.accountingTenantId, ctx.prepaymentKey, tx);
      await assertLeafAccount(db, ctx.accountingTenantId, ctx.revenueKey, tx);
      bookingNo = await allocateBookingNo(db, tx, ctx.accountingTenantId, Number(date.substring(0, 4)));
    }

    // then writes
    const bookingKey = ctx ? creditBookingKey(tenantId, entryId) : '';
    if (account.exists) {
      tx.update(accountRef, { balance: decision.balanceAfter, updatedAt: entry.date });
    } else {
      const { okey: _okey, ...fresh } = new CreditAccountModel(tenantId);
      tx.set(accountRef, { ...fresh, balance: decision.balanceAfter, updatedAt: entry.date });
    }
    tx.set(entryRef, { ...entry, balanceAfter: decision.balanceAfter, bookingKey });

    if (ctx) {
      const lines = creditBookingLines(entry.kind, entry.amount, ctx.prepaymentKey, ctx.revenueKey) ?? [];
      const tenants = [ctx.operatorTenantId];
      const title = `Guthaben ${entry.kind} ${tenantId}${entry.reason ? `: ${entry.reason}` : ''}`;
      tx.set(db.collection(BOOKING_COLLECTION).doc(bookingKey), withoutUndefined({
        tenants, accountingTenantId: ctx.accountingTenantId, isArchived: false,
        title, date, notes: `credit:${tenantId}:${entryId}`, tags: 'credit',
        index: `d:${date} no:${bookingNo} n:${title}`,
        bookingNo, status: 'posted', periodKey: periodKeyFor(ctx.accountingTenantId, date, ctx.fiscalYearStart), documentKeys: [],
      }));
      lines.forEach((line, i) => {
        const costCenterKey = costCenterKeyForLine(ctx.ccCtx, line.accountKey, { explicit: '' });
        tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
          tenants, accountingTenantId: ctx.accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
          ...(costCenterKey ? { costCenterKey } : {}),
          ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
          ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
        }));
      });
    }
    return { balanceAfter: decision.balanceAfter, duplicate: false };
  });
}
