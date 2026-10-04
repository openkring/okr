import { convertDateFormatToString, DateFormat, isMoneyPosition, isRebatePosition } from '@okr/shared-util-core';
import { touchedPeriodKeys } from '../booking/period-lock';

/**
 * One invoice position. `type` is the kind (spec 1.84): a money type ('fix', 'rebate', …; missing =
 * 'fix') or a layout kind ('text', 'subtotal', 'pageBreak') that carries no amount and no account.
 * A discount ('rebate') holds its negative result in `amount`.
 */
export interface PositionInput {
  type?: string;
  name: string;
  amount: number; // CHF
  accountKey: string;
  description?: string;
  discountPercent?: number;
  sortOrder?: number;
}

export interface PostalAddress {
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
}

interface BookingLineInput {
  accountKey: string;
  debitAmount?: { amount: number; currency: 'CHF' };
  creditAmount?: { amount: number; currency: 'CHF' };
}

/** The single rounding rule: CHF decimal to integer Rappen. */
export function toRappen(amount: number): number {
  return Math.round(amount * 100);
}

/** Positions in `sortOrder`; ties and legacy rows without one keep the order they were read in. */
export function sortPositions<T extends { sortOrder?: number }>(positions: T[]): T[] {
  return positions
    .map((p, i) => ({ p, i, order: Number.isFinite(p.sortOrder) ? Number(p.sortOrder) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map(({ p }) => p);
}

/** Sum of the money positions in Rappen (integer, no float drift); layout lines count nothing. */
export function totalRappen(positions: PositionInput[]): number {
  return positions.filter((p) => isMoneyPosition(p)).reduce((sum, p) => sum + toRappen(p.amount), 0);
}

/** A discount without its own account is spread over the revenue above it (spec 1.84 K6). */
const isSpreadDiscount = (p: PositionInput): boolean => isRebatePosition(p) && !p.accountKey?.trim();

/** Reasons why a draft cannot be issued. An empty array means it can. */
export function issueBlockers(positions: PositionInput[], receivablesAccountKey: string): string[] {
  const blockers: string[] = [];
  const money = positions.filter((p) => isMoneyPosition(p));
  if (money.length === 0) blockers.push('no-positions');
  if (money.some((p) => !isSpreadDiscount(p) && !p.accountKey?.trim())) blockers.push('position-without-account');
  if (money.some((p) => !Number.isFinite(p.amount) || toRappen(p.amount) === 0)) blockers.push('invalid-amount');
  if (money.some((p, i) => isSpreadDiscount(p) && spreadBase(money.slice(0, i)).length === 0)) blockers.push('discount-without-base');
  if (totalRappen(positions) <= 0) blockers.push('total-not-positive');
  if (!receivablesAccountKey) blockers.push('no-receivables-account');
  return blockers;
}

/** The positions a spread discount reduces: the positive positions with an account above it. */
function spreadBase(above: PositionInput[]): PositionInput[] {
  return above.filter((p) => !isRebatePosition(p) && p.accountKey?.trim() && toRappen(p.amount) > 0);
}

/**
 * Splits `rappen` over the base positions in proportion to their amounts, largest remainder first,
 * so the parts add up to exactly `rappen`.
 */
function spread(rappen: number, base: PositionInput[]): { accountKey: string; rappen: number }[] {
  const weights = base.map((p) => toRappen(p.amount));
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum === 0) return [];
  const exact = weights.map((w) => (rappen * w) / sum);
  const parts = exact.map((e) => Math.trunc(e));
  let rest = rappen - parts.reduce((s, x) => s + x, 0);
  const byRemainder = exact.map((e, i) => ({ i, r: Math.abs(e - parts[i]) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (rest === 0) break;
    parts[i] += Math.sign(rest);
    rest -= Math.sign(rest);
  }
  return base.map((p, i) => ({ accountKey: p.accountKey, rappen: parts[i] }));
}

/**
 * Debit receivables with the total, credit each account once (first-seen order); layout lines book
 * nothing. A discount with an account debits it; one without is spread over the revenue above it,
 * so only net amounts reach the ledger (spec 1.84 K6). Positions must come in `sortOrder`.
 */
export function invoiceBookingLines(positions: PositionInput[], receivablesAccountKey: string): BookingLineInput[] {
  const credits = new Map<string, number>();
  const money = positions.filter((p) => isMoneyPosition(p));
  money.forEach((p, i) => {
    const parts = isSpreadDiscount(p) ? spread(toRappen(p.amount), spreadBase(money.slice(0, i))) : [{ accountKey: p.accountKey, rappen: toRappen(p.amount) }];
    for (const part of parts) credits.set(part.accountKey, (credits.get(part.accountKey) ?? 0) + part.rappen);
  });
  return [
    { accountKey: receivablesAccountKey, debitAmount: { amount: totalRappen(positions), currency: 'CHF' } },
    ...[...credits]
      .filter(([, amount]) => amount !== 0)
      .map(([accountKey, amount]): BookingLineInput =>
        amount > 0
          ? { accountKey, creditAmount: { amount, currency: 'CHF' } }
          : { accountKey, debitAmount: { amount: -amount, currency: 'CHF' } },
      ),
  ];
}

export const chf = (rappen: number): string => (rappen / 100).toFixed(2);
export const viewDate = (d: string): string => convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false);

/** Recipient name, greeting and postal address fields shared by the invoice and reminder payloads. */
export function recipientFields(
  receiver: { name1?: string; name2?: string; modelType?: string } | undefined, address?: PostalAddress,
): Record<string, string> {
  const firstName = receiver?.name1 ?? '';
  const isPerson = receiver?.modelType === 'person';
  return {
    firstName,
    lastName: receiver?.name2 ?? '',
    greeting: isPerson && firstName ? `Liebe/r ${firstName}` : 'Guten Tag',
    streetName: address?.streetName ?? '',
    streetNumber: address?.streetNumber ?? '',
    zipCode: address?.zipCode ?? '',
    city: address?.city ?? '',
    countryCode: address?.countryCode ?? 'CH',
  };
}

/** Template/QR-slip payload; keys match the invoice layout and the qr-slip util. */
export function buildInvoicePayload(i: {
  invoiceId: string;
  title: string;
  invoiceDate: string;
  dueDate: string;
  receiver: { name1: string; name2: string; modelType: string };
  positions: PositionInput[];
  address?: PostalAddress;
}): Record<string, unknown> {
  return {
    invoiceNumber: i.invoiceId,
    title: i.title,
    date: viewDate(i.invoiceDate),
    dueDate: viewDate(i.dueDate),
    ...recipientFields(i.receiver, i.address),
    amount: chf(totalRappen(i.positions)),
    positions: payloadPositions(i.positions),
    qrMessage: `Rechnung ${i.invoiceId}`,
  };
}

/**
 * The positions as the template sees them, in the given order (spec 1.84 §6): each with its `kind` and,
 * for Handlebars, a boolean flag per non-standard kind. A subtotal carries the sum of the money
 * positions above it; text and page-break lines carry no amount. `description` only when set, so a
 * template's `{{#if description}}` never prints an empty line (1.79 §3.6).
 */
function payloadPositions(positions: PositionInput[]): Record<string, unknown>[] {
  let running = 0;
  return positions.map((p) => {
    const description = p.description ? { description: p.description } : {};
    switch (p.type) {
      case 'text': return { kind: 'text', isText: true, name: p.name, ...description };
      case 'pageBreak': return { kind: 'pageBreak', isPageBreak: true, name: p.name };
      case 'subtotal': return { kind: 'subtotal', isSubtotal: true, name: p.name, amount: chf(running) };
    }
    running += toRappen(p.amount);
    const kind = isRebatePosition(p) ? { kind: 'rebate', isRebate: true } : { kind: 'position' };
    return { ...kind, name: p.name, amount: chf(toRappen(p.amount)), ...description };
  });
}

/**
 * Why a writeInvoice call must be refused, or undefined when it may proceed.
 * Only drafts are editable; an issued invoice is changed through its own lifecycle callables.
 */
export function draftWriteRefusal(existingState: string | undefined, mode: 'create' | 'update' | 'delete'): string | undefined {
  if (mode === 'create') return undefined;
  if (existingState === undefined) return 'not-found';
  return existingState === 'draft' ? undefined : 'not-a-draft';
}

/** Drops top-level `undefined` values: firebase-admin refuses them ("Cannot use undefined as a Firestore value"). */
export function withoutUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * What issueInvoice does with an invoice in this state. `issuing` is the transient state between
 * numbering and the final ledger transaction: a run that finds it resumes with the stored number.
 */
export function issueOutcome(state: string): 'issue' | 'already-issued' | 'refuse' {
  if (state === 'draft' || state === 'issuing') return 'issue';
  if (state === 'pending' || state === 'paid') return 'already-issued';
  return 'refuse';
}

/** Header reasons why a draft cannot be issued (drafts may lack receiver and date; issued invoices may not). */
export function issueHeaderBlockers(h: { receiverKey?: string; invoiceDate?: string; dueDate?: string; invoiceTemplateId?: string }): string[] {
  const blockers: string[] = [];
  if (!h.receiverKey?.trim()) blockers.push('no-receiver');
  const hasInvoiceDate = /^\d{8}$/.test(h.invoiceDate ?? '');
  if (!hasInvoiceDate) blockers.push('no-invoice-date');
  // an issued invoice must say when it is due; StoreDate strings (yyyymmdd) compare lexically
  if (!/^\d{8}$/.test(h.dueDate ?? '')) blockers.push('no-due-date');
  else if (hasInvoiceDate && (h.dueDate as string) < (h.invoiceDate as string)) blockers.push('due-before-invoice-date');
  if (!h.invoiceTemplateId?.trim()) blockers.push('no-invoice-template');
  return blockers;
}

/**
 * The final issue transaction's decision (R10). It may only write while the invoice is still in
 * this run's `issuing` state: same number and same run nonce. An already issued invoice returns
 * the stored result and writes nothing; an existing booking is never written twice.
 */
export function finalizeDecision(
  current: { state: string; invoiceNo: number; issueRunId: string },
  expected: { expectedInvoiceNo: number; expectedRunId: string; bookingExists: boolean },
): 'return-stored' | 'refuse' | 'write' | 'write-without-booking' {
  if (issueOutcome(current.state) === 'already-issued') return 'return-stored';
  if (current.state !== 'issuing' || current.invoiceNo !== expected.expectedInvoiceNo || current.issueRunId !== expected.expectedRunId) {
    return 'refuse';
  }
  return expected.bookingExists ? 'write-without-booking' : 'write';
}

/** The period keys an issue touches: exactly the annual period of the invoice date. */
export function issuePeriodKeys(accountingTenantId: string, invoiceDate: string, fiscalYearStart: number): string[] {
  return touchedPeriodKeys(accountingTenantId, [invoiceDate], fiscalYearStart);
}

/** Search index of the invoice booking, in the journal format (`d:{date} no:{bookingNo}`) plus title and invoice number. */
export function invoiceBookingIndex(date: string, bookingNo: number, title: string, invoiceId: string): string {
  return `d:${date} no:${bookingNo} n:${title} i:${invoiceId}`;
}
