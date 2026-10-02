/**
 * Pure payment and cancel rules for native invoices (spec 1.76 phase 2).
 * No Firestore access: the callables read the documents and feed them in here.
 * All amounts are Rappen.
 */

import { classifyStoreDate, isValidPartialStoreDate } from '@okr/shared-util-core';

export interface PaymentInput {
  paymentId: string;
  date: string;
  amount: number;
  bankAccountKey: string;
  bookingKey: string;
}

export interface StoredPayment {
  date: string;
  amount: number;
  bankAccountKey: string;
  bookingKey: string;
}

export interface InvoiceLike {
  state: string;
  totalAmount?: { amount: number } | null;
  payments?: { date: string; amount: number; bankAccountKey: string; bookingKey?: string }[];
  accountingTenantId: string;
}

export interface PaymentBookingLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: 'CHF' };
  creditAmount?: { amount: number; currency: 'CHF' };
}

const paidSum = (invoice: InvoiceLike): number => (invoice.payments ?? []).reduce((s, p) => s + p.amount, 0);

/** Total minus the sum of the payments, never negative. */
export function openAmount(invoice: InvoiceLike): number {
  return Math.max(0, (invoice.totalAmount?.amount ?? 0) - paidSum(invoice));
}

/**
 * The states that take a payment: an issued open invoice (`pending`) and the open items migrated
 * from bexio (`partial`, `unpaid`). Keep in step with `isPayableState` in @okr/finance-invoice-util.
 */
export const PAYABLE_STATES: readonly string[] = ['pending', 'partial', 'unpaid'];

export function isPayableState(state: string | undefined): boolean {
  return !!state && PAYABLE_STATES.includes(state);
}

/** Refusal codes for recording a payment: not-payable, invalid-amount, overpayment, no-payment-date. */
export function paymentBlockers(invoice: InvoiceLike, amount: number, date: string): string[] {
  const blockers: string[] = [];
  if (!isPayableState(invoice.state)) blockers.push('not-payable');
  const valid = Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
  if (!valid) blockers.push('invalid-amount');
  else if (amount > openAmount(invoice)) blockers.push('overpayment');
  if (!date) blockers.push('no-payment-date');
  return blockers;
}

/** Appends the payment; the payment that completes the total flips the state to paid, any other keeps the state. */
export function applyInvoicePayment(invoice: InvoiceLike, p: PaymentInput): { payments: StoredPayment[]; state: string; paymentDate?: string } {
  const payments: StoredPayment[] = [
    ...(invoice.payments ?? []).map(x => ({ date: x.date ?? '', amount: x.amount ?? 0, bankAccountKey: x.bankAccountKey ?? '', bookingKey: x.bookingKey ?? '' })),
    { date: p.date, amount: p.amount, bankAccountKey: p.bankAccountKey, bookingKey: p.bookingKey },
  ];
  const total = invoice.totalAmount?.amount ?? 0;
  const sum = payments.reduce((s, x) => s + x.amount, 0);
  if (sum >= total) return { payments, state: 'paid', paymentDate: p.date };
  return { payments, state: invoice.state };
}

/** Debit the bank account, credit the receivables account. */
export function paymentBookingLines(bankAccountKey: string, receivablesKey: string, amount: number): PaymentBookingLine[] {
  return [
    { accountKey: bankAccountKey, debitAmount: { amount, currency: 'CHF' } },
    { accountKey: receivablesKey, creditAmount: { amount, currency: 'CHF' } },
  ];
}

/**
 * Refusal codes for linking an existing booking as payment. Bookings okr writes for invoices itself
 * (`invoice-…`) and archived bookings are refused; archived lines do not count towards the credit.
 */
export function linkBlockers(
  booking: { status?: string; accountingTenantId?: string; isArchived?: boolean } | undefined,
  lines: { accountKey: string; creditAmount?: { amount: number } | null; isArchived?: boolean }[],
  receivablesKey: string,
  accountingTenantId: string,
  amount: number,
  alreadyLinked: string[],
  bookingKey: string,
): string[] {
  if (!booking) return ['booking-not-found'];
  const blockers: string[] = [];
  if (bookingKey.startsWith('invoice-')) blockers.push('invoice-booking');
  if (booking.isArchived === true) blockers.push('booking-archived');
  if (booking.status !== 'posted') blockers.push('booking-not-posted');
  if (booking.accountingTenantId !== accountingTenantId) blockers.push('foreign-booking');
  const credited = lines.filter(l => l.accountKey === receivablesKey && l.isArchived !== true).reduce((s, l) => s + (l.creditAmount?.amount ?? 0), 0);
  if (credited < amount) blockers.push('no-receivables-credit');
  if (alreadyLinked.includes(bookingKey)) blockers.push('already-linked');
  return blockers;
}

/** A retry with an already stored booking key returns the stored payment instead of writing again. */
export function paymentDecision(existing: { bookingKey: string }[], bookingKey: string): 'write' | 'return-stored' {
  return existing.some(p => p.bookingKey === bookingKey) ? 'return-stored' : 'write';
}

/** The client-generated idempotency key of a payment: 8 to 32 letters or digits. */
export function isValidPaymentId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9]{8,32}$/.test(id);
}

/**
 * A retried link (same booking, amount and date already stored on this invoice) returns the stored
 * result; anything else goes on to `linkBlockers`, which reports `already-linked` for a different one.
 */
export function linkDecision(existing: { bookingKey: string; amount: number; date: string }[], bookingKey: string, amount: number, date: string): 'write' | 'return-stored' {
  return existing.some(p => p.bookingKey === bookingKey && p.amount === amount && p.date === date) ? 'return-stored' : 'write';
}

/**
 * The bank account of a linked booking: the first debit line (positive amount) on one of the configured
 * payment accounts, else the first debit line, else ''.
 */
export function pickBankAccount(lines: { accountKey: string; debitAmount?: { amount: number } | null }[], paymentAccountKeys: string[]): string {
  const debits = lines.filter(l => (l.debitAmount?.amount ?? 0) > 0);
  return (debits.find(l => paymentAccountKeys.includes(l.accountKey)) ?? debits[0])?.accountKey ?? '';
}

/** A complete, real calendar StoreDate (yyyyMMdd): 8 digits, month and day exist in that year. */
export function isValidStoreDate(value: unknown): value is string {
  return typeof value === 'string' && classifyStoreDate(value) === 'full' && isValidPartialStoreDate(value);
}

/**
 * Appends "[Storniert {viewDate}] {reason}" to the notes (newline separated when notes exist). The reason
 * is truncated so the result fits `maxLength`; existing notes are never cut and the call never refuses.
 */
export function appendStornoNote(notes: string, viewDate: string, reason: string, maxLength: number): string {
  const prefix = `${notes ? `${notes}\n` : ''}[Storniert ${viewDate}] `;
  return prefix + reason.substring(0, Math.max(0, maxLength - prefix.length));
}

/** The okr issue booking a storno can reverse: in these books, posted and not archived. */
export function isUsableIssueBooking(
  booking: { status?: string; accountingTenantId?: string; isArchived?: boolean } | undefined, accountingTenantId: string,
): boolean {
  return !!booking && booking.accountingTenantId === accountingTenantId && booking.status === 'posted' && booking.isArchived !== true;
}

/**
 * Refusal codes for cancelling: not-cancellable, has-payments, no-issue-booking, storno-before-invoice
 * (the storno is dated before the invoice; only checked when both dates are given).
 */
export function cancelBlockers(
  invoice: InvoiceLike & { bookingKey?: string; invoiceDate?: string }, invoiceKey: string, issueBookingUsable: boolean, stornoDate?: string,
): string[] {
  const blockers: string[] = [];
  if (invoice.state !== 'pending') blockers.push('not-cancellable');
  if ((invoice.payments ?? []).length > 0) blockers.push('has-payments');
  if (invoice.bookingKey !== `invoice-${invoiceKey}` || !issueBookingUsable) blockers.push('no-issue-booking');
  if (stornoDate && invoice.invoiceDate && stornoDate < invoice.invoiceDate) blockers.push('storno-before-invoice');
  return blockers;
}

/** Swaps debit and credit on every line, keeping all other fields. */
export function reversalLines<T extends { debitAmount?: unknown; creditAmount?: unknown }>(lines: T[]): T[] {
  return lines.map(l => {
    const { debitAmount, creditAmount, ...rest } = l;
    const out: Record<string, unknown> = { ...rest };
    if (creditAmount != null) out['debitAmount'] = creditAmount;
    if (debitAmount != null) out['creditAmount'] = debitAmount;
    return out as T;
  });
}
