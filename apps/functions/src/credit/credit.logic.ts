// Pure rules of the prepaid credit ledger (Guthaben). Amounts are signed Rappen.
import type { CreditEntryKind } from '@okr/shared-models';

export type CreditDecision = { ok: true; balanceAfter: number } | { ok: false; reason: 'insufficient-credit' };

/** The next balance, or a refusal when it would go below zero. */
export function creditDecision(balance: number, amount: number): CreditDecision {
  const balanceAfter = balance + amount;
  if (balanceAfter < 0) return { ok: false, reason: 'insufficient-credit' };
  return { ok: true, balanceAfter };
}

export interface CreditBookingLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: 'CHF' };
  creditAmount?: { amount: number; currency: 'CHF' };
}

/**
 * The booking of a ledger entry in the operator's books, or null when none is made (a top-up is booked by
 * its invoice and payment). A deduction recognises revenue out of the prepayment; a reversal undoes that;
 * a correction goes in the direction of its sign.
 */
export function creditBookingLines(kind: CreditEntryKind, amount: number, prepaymentKey: string, revenueKey: string): CreditBookingLine[] | null {
  if (kind === 'topup' || amount === 0) return null;
  const abs = Math.abs(amount);
  const money = { amount: abs, currency: 'CHF' as const };
  const consume = amount < 0; // credit goes down: prepayment is debited, revenue credited
  return consume
    ? [{ accountKey: prepaymentKey, debitAmount: money }, { accountKey: revenueKey, creditAmount: money }]
    : [{ accountKey: revenueKey, debitAmount: money }, { accountKey: prepaymentKey, creditAmount: money }];
}

export const creditBookingKey = (tenantId: string, entryId: string): string => `credit-${tenantId}-${entryId}`;

/** deduction < 0, reversal > 0, topup > 0, correction either way but not 0. */
export function signMatchesKind(kind: CreditEntryKind, amount: number): boolean {
  switch (kind) {
    case 'deduction': return amount < 0;
    case 'reversal':
    case 'topup': return amount > 0;
    case 'correction': return amount !== 0;
  }
}
