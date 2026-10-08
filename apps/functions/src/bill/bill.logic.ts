/**
 * Pure rules for native bills (spec 1.85 phase 3): line cleaning, the issue booking, and when a bill
 * may be written or booked. No Firestore access. All amounts are Rappen.
 */
import { HttpsError } from 'firebase-functions/v2/https';

import { assertProjectKeyShapes } from '../project/project-context';

export interface BillLineInput {
  title: string;
  accountKey: string;
  amount: number;
  vatCodeKey: string;
  costCenterKey: string;
  /** Kostenträger (spec 1.92 D1); legacy stored lines lack it */
  projectKey?: string;
}

/** A line as cleanBillLines returns it: every field filled. */
export type CleanBillLine = BillLineInput & { projectKey: string };

export interface BillBookingLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: 'CHF' };
  creditAmount?: { amount: number; currency: 'CHF' };
  description?: string;
  vatCodeKey?: string;
  costCenterKey?: string;
  projectKey?: string;
}

export const MAX_BILL_LINES = 50;
const MAX_LINE_TITLE_LENGTH = 200;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The lines as the client may send them: at most MAX_BILL_LINES, each amount a non-negative integer
 * (Rappen; a draft may still hold 0), strings trimmed, unknown fields dropped. Throws invalid-argument.
 */
export function cleanBillLines(input: unknown): CleanBillLine[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new HttpsError('invalid-argument', 'lines must be an array');
  if (input.length > MAX_BILL_LINES) throw new HttpsError('invalid-argument', 'too-many-lines', { reason: 'too-many-lines' });
  assertProjectKeyShapes(input.filter((l) => !!l && typeof l === 'object') as { projectKey?: unknown }[]);
  return input.map((l, i) => {
    if (!l || typeof l !== 'object') throw new HttpsError('invalid-argument', `line ${i} must be an object`);
    const o = l as Record<string, unknown>;
    const amount = o['amount'];
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
      throw new HttpsError('invalid-argument', `line ${i} needs a non-negative integer amount (Rappen)`);
    }
    return {
      title: str(o['title']).slice(0, MAX_LINE_TITLE_LENGTH),
      accountKey: str(o['accountKey']),
      amount,
      vatCodeKey: str(o['vatCodeKey']),
      costCenterKey: str(o['costCenterKey']),
      projectKey: str(o['projectKey']),
    };
  });
}

export function billTotal(lines: { amount: number }[]): number {
  return lines.reduce((s, l) => s + (l.amount ?? 0), 0);
}

/** The issue booking `bill-{key}`: one debit per bill line, one credit on the payables account for the total. */
export function billBookingLines(lines: BillLineInput[], payablesKey: string): BillBookingLine[] {
  const debits: BillBookingLine[] = lines.map((l) => ({
    accountKey: l.accountKey,
    debitAmount: { amount: l.amount, currency: 'CHF' },
    ...(l.title ? { description: l.title } : {}),
    ...(l.vatCodeKey ? { vatCodeKey: l.vatCodeKey } : {}),
    ...(l.costCenterKey ? { costCenterKey: l.costCenterKey } : {}),
    ...(l.projectKey ? { projectKey: l.projectKey } : {}),
  }));
  return [...debits, { accountKey: payablesKey, creditAmount: { amount: billTotal(lines), currency: 'CHF' } }];
}

/**
 * Why a bill cannot be booked: not-draft, already-booked, no-lines, zero-amount (a line or the total
 * is 0), no-account (a line without account), no-bill-date, no-payables-account. Empty = bookable.
 */
export function bookBlockers(
  bill: { state?: string; lines?: { amount: number; accountKey: string }[]; billDate?: string; bookingKeys?: string[] }, payablesKey: string,
): string[] {
  const blockers: string[] = [];
  const lines = bill.lines ?? [];
  if (bill.state !== 'draft') blockers.push('not-draft');
  if ((bill.bookingKeys ?? []).length > 0) blockers.push('already-booked');
  if (lines.length === 0) blockers.push('no-lines');
  else {
    if (lines.some((l) => !(l.amount > 0))) blockers.push('zero-amount');
    if (lines.some((l) => !l.accountKey)) blockers.push('no-account');
  }
  if (!bill.billDate) blockers.push('no-bill-date');
  if (!payablesKey) blockers.push('no-payables-account');
  return blockers;
}

/** Why `writeBill` refuses: only a draft without a booking may be updated or deleted. */
export function draftWriteRefusal(
  existing: { state?: string; bookingKeys?: string[] } | undefined, mode: 'create' | 'update' | 'delete',
): string | undefined {
  if (mode === 'create') return undefined;
  if (!existing) return 'not-found';
  if (existing.state !== 'draft' || (existing.bookingKeys ?? []).length > 0) return 'not-a-draft';
  return undefined;
}
