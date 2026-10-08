import { AccountModel, BillLine, BillModel } from '@okr/shared-models';
import { CostCenterLike, isProfitAndLossAccountId, ProjectLike, resolveCostCenterKey } from '@okr/shared-util-core';

/** writeBill keeps at most this many lines (server: MAX_BILL_LINES). */
export const MAX_BILL_LINES = 50;
/** writeBill caps a line title here (server: MAX_LINE_TITLE_LENGTH). */
export const BILL_LINE_TITLE_LENGTH = 200;
/** QR reference: 27 digits (QRR) or up to 25 characters (SCOR); room for spacing. */
export const BILL_REFERENCE_LENGTH = 40;
/** An IBAN has at most 34 characters. */
export const BILL_IBAN_LENGTH = 34;

/** A new, empty bill line on `accountKey` (the books' default expense account, or ''). */
export function newBillLine(accountKey = '', amount = 0, title = ''): BillLine {
  return { title, accountKey, amount, vatCodeKey: '', costCenterKey: '', projectKey: '' };
}

/** Σ line amounts in Rappen. */
export function billLinesTotal(lines: Pick<BillLine, 'amount'>[]): number {
  return (lines ?? []).reduce((s, l) => s + (l?.amount ?? 0), 0);
}

/** A native bill that may still be changed: a draft without its booking (legacy docs may lack the fields). */
export function isDraftBill(bill: Pick<BillModel, 'state' | 'bookingKeys'> | undefined): boolean {
  return bill?.state === 'draft' && (bill.bookingKeys ?? []).length === 0;
}

/** The editable copy of a bill's lines (legacy docs lack `lines`). */
export function toBillLines(bill: Pick<BillModel, 'lines'> | undefined): BillLine[] {
  return (bill?.lines ?? []).map((l) => ({
    title: l.title ?? '', accountKey: l.accountKey ?? '', amount: l.amount ?? 0, vatCodeKey: l.vatCodeKey ?? '', costCenterKey: l.costCenterKey ?? '', projectKey: l.projectKey ?? '',
  }));
}

type AccountLike = Pick<AccountModel, 'okey' | 'id'>;

/** A Kostenstelle / Kostenträger sits on profit-and-loss lines only (spec 3.14, 1.65). */
function isPnlLine(line: Pick<BillLine, 'accountKey'>, accounts: AccountLike[]): boolean {
  return isProfitAndLossAccountId(accounts.find((a) => a.okey === line.accountKey)?.id);
}

/** The cost-centre picker is offered on P&L lines when cost centres are enabled (not on externally managed books). */
export function showLineCostCenter(line: Pick<BillLine, 'accountKey'>, accounts: AccountLike[], costCentersEnabled: boolean): boolean {
  return costCentersEnabled && isPnlLine(line, accounts);
}

/** The project picker: a P&L line, and an active project to pick or the line already carries one (same gate as the booking form). */
export function showLineProject(line: Pick<BillLine, 'accountKey' | 'projectKey'>, accounts: AccountLike[], projects: (ProjectLike & { okey?: string })[]): boolean {
  return (projects.some((p) => !p.isArchived) || !!line.projectKey) && isPnlLine(line, accounts);
}

/** The Kostenstelle bookBill fills into a line saved without one (account default, else book default) — '' = none. */
export function lineCostCenterFallback(
  line: Pick<BillLine, 'accountKey'>, accounts: (AccountModel)[], costCenters: CostCenterLike[], bookDefault = '',
): string {
  return resolveCostCenterKey({ account: accounts.find((a) => a.okey === line.accountKey), costCenters, bookDefault });
}

/**
 * The line on another account. Moving to a balance-sheet account drops Kostenstelle and Kostenträger
 * (they sit on P&L lines only); an account that is not in `accounts` (list not loaded) changes nothing else.
 */
export function withLineAccount(line: BillLine, accountKey: string, accounts: AccountLike[]): BillLine {
  const next = { ...line, accountKey };
  const known = accounts.some((a) => a.okey === accountKey);
  return known && !isPnlLine(next, accounts) ? { ...next, costCenterKey: '', projectKey: '' } : next;
}

/** The request of the `updateBillDetails` callable (spec 1.92); lines are positional, same length as the stored lines. */
export interface BillDetailsPayload {
  billKey: string;
  title: string;
  notes: string;
  dueDate?: string;
  paymentReference?: string;
  creditorIban?: string;
  lines?: { title: string; costCenterKey: string; projectKey: string }[];
}

/** A paid bill keeps its payment data; the server refuses a changed value, so the form sends none (spec 1.92 §3). */
export function isBillPaymentDataEditable(bill: Pick<BillModel, 'state'> | undefined): boolean {
  return bill?.state !== 'paid';
}

/**
 * The details of a booked bill as the callable takes them: title and notes always; due date, reference
 * and IBAN only while not fully paid; per line the title, Kostenstelle and Kostenträger. A bill without
 * lines (migrated from bexio) sends the header fields only. The server treats unchanged values as no-ops,
 * so the whole form is sent.
 */
export function billDetailsPayload(bill: BillModel, lines: BillLine[]): BillDetailsPayload {
  const payload: BillDetailsPayload = { billKey: bill.okey, title: bill.title ?? '', notes: bill.notes ?? '' };
  if (isBillPaymentDataEditable(bill)) {
    payload.dueDate = bill.dueDate ?? '';
    payload.paymentReference = bill.paymentReference ?? '';
    payload.creditorIban = bill.creditorIban ?? '';
  }
  if (lines.length > 0) {
    payload.lines = lines.map((l) => ({ title: l.title ?? '', costCenterKey: l.costCenterKey ?? '', projectKey: l.projectKey ?? '' }));
  }
  return payload;
}
