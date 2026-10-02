import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { touchedPeriodKeys } from '../booking/period-lock';

export interface PositionInput {
  name: string;
  amount: number; // CHF
  accountKey: string;
  description?: string;
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

/** Sum of all positions in Rappen (integer, no float drift). */
export function totalRappen(positions: PositionInput[]): number {
  return positions.reduce((sum, p) => sum + toRappen(p.amount), 0);
}

/** Reasons why a draft cannot be issued. An empty array means it can. */
export function issueBlockers(positions: PositionInput[], receivablesAccountKey: string): string[] {
  const blockers: string[] = [];
  if (positions.length === 0) blockers.push('no-positions');
  if (positions.some((p) => !p.accountKey?.trim())) blockers.push('position-without-account');
  if (positions.some((p) => !Number.isFinite(p.amount) || toRappen(p.amount) === 0)) blockers.push('invalid-amount');
  if (totalRappen(positions) <= 0) blockers.push('total-not-positive');
  if (!receivablesAccountKey) blockers.push('no-receivables-account');
  return blockers;
}

/** Debit receivables with the total, credit each revenue account once (first-seen order). */
export function invoiceBookingLines(positions: PositionInput[], receivablesAccountKey: string): BookingLineInput[] {
  const credits = new Map<string, number>();
  for (const p of positions) {
    credits.set(p.accountKey, (credits.get(p.accountKey) ?? 0) + toRappen(p.amount));
  }
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
    positions: i.positions.map((p) => ({ name: p.name, amount: chf(toRappen(p.amount)) })),
    qrMessage: `Rechnung ${i.invoiceId}`,
  };
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
