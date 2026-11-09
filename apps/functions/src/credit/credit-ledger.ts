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
import { creditBookingKey, creditBookingLines, creditDecision, signMatchesKind } from './credit.logic';

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
async function loadBookingContext(db: Firestore, entryId: string): Promise<BookingContext> {
  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const config = await loadOwnedAccountingConfig(db, operatorTenantId, `credit ${entryId}`, accountingTenantId, 'booked');
  const prepaymentKey = String(config['prepaymentAccountKey'] ?? '');
  const revenueKey = String(config['transactionRevenueAccountKey'] ?? '');
  if (!prepaymentKey || !revenueKey) {
    throw refuse('credit-accounts-missing', `${accountingTenantId} has no prepaymentAccountKey / transactionRevenueAccountKey: credit is not set up`);
  }
  const ccCtx = await loadCostCenterContext(db, operatorTenantId, accountingTenantId, [prepaymentKey, revenueKey]);
  return { operatorTenantId, accountingTenantId, prepaymentKey, revenueKey, fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1, ccCtx };
}

export interface ApplyCreditOptions {
  /**
   * A reversal of part of this deduction entry: read in the same transaction, the reversal is refused
   * ('reversal-exceeds-entry') when the reversals together would exceed the deduction, and the deduction's
   * running `reversedAmount` is raised with the write.
   */
  parentEntryId?: string;
}

export async function applyCreditEntry(
  db: Firestore, tenantId: string, entryId: string, entry: CreditEntryInput, options: ApplyCreditOptions = {},
): Promise<{ balanceAfter: number; duplicate: boolean }> {
  const accountRef = db.collection(CreditAccountCollection).doc(tenantId);
  const entryRef = accountRef.collection(CreditEntrySubcollection).doc(entryId);
  if (!signMatchesKind(entry.kind, entry.amount)) {
    throw new HttpsError('invalid-argument', 'credit-sign-mismatch', { reason: 'credit-sign-mismatch' });
  }
  if (options.parentEntryId !== undefined && (entry.kind !== 'reversal' || !options.parentEntryId || options.parentEntryId === entryId)) {
    throw new HttpsError('invalid-argument', 'a parent entry is only given for a reversal of another entry');
  }
  const parentRef = options.parentEntryId ? accountRef.collection(CreditEntrySubcollection).doc(options.parentEntryId) : undefined;
  // A retried duplicate answers from the stored entry, even if the books' config changed meanwhile.
  const prior = await entryRef.get();
  if (prior.exists) return { balanceAfter: Number((prior.data() ?? {})['balanceAfter'] ?? 0), duplicate: true };
  const booked = creditBookingLines(entry.kind, entry.amount, 'p', 'r') !== null;
  const ctx = booked ? await loadBookingContext(db, entryId) : undefined;
  const date = entry.date.substring(0, 8);

  return db.runTransaction(async tx => {
    // all reads first
    const existing = await tx.get(entryRef);
    if (existing.exists) return { balanceAfter: Number((existing.data() ?? {})['balanceAfter'] ?? 0), duplicate: true };
    const account = await tx.get(accountRef);
    const balance = account.exists ? Number((account.data() ?? {})['balance'] ?? 0) : 0;
    const decision = creditDecision(balance, entry.amount);
    if (!decision.ok) throw new HttpsError('failed-precondition', decision.reason);
    let reversedAfter = 0;
    if (parentRef) {
      const parent = await tx.get(parentRef);
      const p = parent.data() ?? {};
      if (!parent.exists) throw new HttpsError('not-found', `credit entry ${options.parentEntryId} not found`);
      if (p['kind'] !== 'deduction') throw new HttpsError('failed-precondition', 'only a deduction can be reversed', { reason: 'not-a-deduction' });
      reversedAfter = Number(p['reversedAmount'] ?? 0) + entry.amount;
      if (reversedAfter > Math.abs(Number(p['amount'] ?? 0))) {
        throw new HttpsError('failed-precondition', 'reversal-exceeds-entry', { reason: 'reversal-exceeds-entry' });
      }
    }

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
    if (parentRef) tx.update(parentRef, { reversedAmount: reversedAfter });

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
