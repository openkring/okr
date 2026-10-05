/**
 * Pure payment rules for bills (Kreditoren, spec 1.85) — the debit-side twin of
 * invoice-payment.logic.ts. No Firestore access: the callables read the documents and feed them in
 * here. All amounts are Rappen.
 */

import { openAmount as openInvoiceAmount } from '../invoice/invoice-payment.logic';

export interface StoredBillPayment {
  date: string;
  amount: number;
  type: string;
  bookingKey: string;
  bankAccountKey?: string;
}

export interface BillLike {
  state: string;
  totalAmount?: { amount: number } | null;
  payments?: Partial<StoredBillPayment>[];
  accountingTenantId: string;
  billDate?: string;
  tenants?: string[];
}

export interface BillPaymentLine {
  accountKey: string;
  debitAmount?: { amount: number; currency: 'CHF' };
  creditAmount?: { amount: number; currency: 'CHF' };
}

/** The payment type okr stamps on a payment it records (bexio's own types stay on migrated rows). */
export const BILL_PAYMENT_TYPE = 'MANUAL';

/** The states that take a payment: an open bill (`todo`) and one bexio marked `overdue`. */
export const PAYABLE_BILL_STATES: readonly string[] = ['todo', 'overdue'];

export function isPayableBill(state: string | undefined): boolean {
  return !!state && PAYABLE_BILL_STATES.includes(state);
}

/** A stored payment with every field set; a legacy row without `type`/`bookingKey` gets '' there. */
function normalized(p: Partial<StoredBillPayment>): StoredBillPayment {
  const out: StoredBillPayment = { date: p.date ?? '', amount: p.amount ?? 0, type: p.type ?? '', bookingKey: p.bookingKey ?? '' };
  if (p.bankAccountKey) out.bankAccountKey = p.bankAccountKey;
  return out;
}

const paidSum = (payments: { amount?: number }[] | undefined): number => (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);

/** Total minus the sum of the payments, never negative. */
export function openBillAmount(bill: BillLike): number {
  return Math.max(0, (bill.totalAmount?.amount ?? 0) - paidSum(bill.payments));
}

/** Refusal codes for recording a payment: not-payable, invalid-amount, overpayment, no-payment-date. */
export function billPaymentBlockers(bill: BillLike, amount: number, date: string): string[] {
  const blockers: string[] = [];
  if (!isPayableBill(bill.state)) blockers.push('not-payable');
  const valid = Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
  if (!valid) blockers.push('invalid-amount');
  else if (amount > openBillAmount(bill)) blockers.push('overpayment');
  if (!date) blockers.push('no-payment-date');
  return blockers;
}

/** Appends the payment; the payment that completes the total sets `paid` and the payment date, any other keeps the state. */
export function applyBillPayment(
  bill: BillLike, p: { date: string; amount: number; bookingKey: string; bankAccountKey?: string },
): { payments: StoredBillPayment[]; state: string; paymentDate?: string } {
  const added: StoredBillPayment = { date: p.date, amount: p.amount, type: BILL_PAYMENT_TYPE, bookingKey: p.bookingKey };
  if (p.bankAccountKey) added.bankAccountKey = p.bankAccountKey;
  const payments = [...(bill.payments ?? []).map(normalized), added];
  if (paidSum(payments) >= (bill.totalAmount?.amount ?? 0)) return { payments, state: 'paid', paymentDate: p.date };
  return { payments, state: bill.state };
}

/** Debit the payables account (Kreditoren), credit the bank. */
export function billPaymentBookingLines(payablesKey: string, bankAccountKey: string, amount: number): BillPaymentLine[] {
  return [
    { accountKey: payablesKey, debitAmount: { amount, currency: 'CHF' } },
    { accountKey: bankAccountKey, creditAmount: { amount, currency: 'CHF' } },
  ];
}

/**
 * Refusal codes for linking an existing booking as a bill payment. Bookings okr writes for bills or
 * invoices itself (`bill-…`, `invoice-…`) and archived bookings are refused; the booking must debit the
 * payables account with at least the amount (archived lines do not count), and must not pay another bill.
 * @param linkedElsewhere every payment booking key already stored on any bill of these books
 */
export function billLinkBlockers(
  booking: { status?: string; accountingTenantId?: string; isArchived?: boolean } | undefined,
  lines: { accountKey: string; debitAmount?: { amount: number } | null; isArchived?: boolean }[],
  payablesKey: string,
  accountingTenantId: string,
  amount: number,
  linkedElsewhere: string[],
  bookingKey: string,
): string[] {
  if (!booking) return ['booking-not-found'];
  const blockers: string[] = [];
  if (bookingKey.startsWith('bill-') || bookingKey.startsWith('invoice-')) blockers.push('own-booking');
  if (booking.isArchived === true) blockers.push('booking-archived');
  if (booking.status !== 'posted') blockers.push('booking-not-posted');
  if (booking.accountingTenantId !== accountingTenantId) blockers.push('foreign-booking');
  const debited = lines.filter((l) => l.accountKey === payablesKey && l.isArchived !== true).reduce((s, l) => s + (l.debitAmount?.amount ?? 0), 0);
  if (debited < amount || debited <= 0) blockers.push('no-payables-debit');
  if (linkedElsewhere.includes(bookingKey)) blockers.push('already-linked');
  return blockers;
}

/** Every payment booking key stored on the given bills ('' and missing keys left out). */
export function linkedPaymentKeys(bills: { payments?: { bookingKey?: string }[] }[]): string[] {
  return bills.flatMap((b) => (b.payments ?? []).map((p) => p.bookingKey ?? '')).filter((k) => k.length > 0);
}

/** The latest date among the payments, or ''. */
function latestDate(payments: { date?: string }[]): string {
  return payments.reduce((latest, p) => ((p.date ?? '') > latest ? (p.date ?? '') : latest), '');
}

/**
 * The bill after the payment that points at `bookingKey` was removed (the booking was deleted in the
 * journal, spec 1.85 Q3), or undefined when the bill carries no such payment. A paid bill that is open
 * again goes back to `todo`; the payment date becomes the latest remaining one, or ''.
 */
export function billAfterPaymentRemoval(bill: BillLike, bookingKey: string): { payments: StoredBillPayment[]; state: string; paymentDate: string } | undefined {
  const all = bill.payments ?? [];
  if (!all.some((p) => p.bookingKey === bookingKey)) return undefined;
  const payments = all.filter((p) => p.bookingKey !== bookingKey).map(normalized);
  const open = (bill.totalAmount?.amount ?? 0) - paidSum(payments) > 0;
  const state = bill.state === 'paid' && open ? 'todo' : bill.state;
  return { payments, state, paymentDate: latestDate(payments) };
}

interface InvoicePaymentLike { date: string; amount: number; bankAccountKey?: string; bookingKey?: string }

/**
 * The invoice after the payment that points at `bookingKey` was removed, or undefined when it carries
 * no such payment. An invoice that is open again goes back to `pending` when okr issued it (its issue
 * booking is `invoice-…`), otherwise — a migrated bexio invoice — to `partial` while payments remain,
 * else `unpaid`. Reminder fees count towards the open amount, as in 1.76.
 */
export function invoiceAfterPaymentRemoval(
  invoice: { state: string; bookingKey?: string; totalAmount?: { amount: number } | null; payments?: InvoicePaymentLike[]; reminders?: { fee?: number; waivedAt?: string }[] },
  bookingKey: string,
): { payments: InvoicePaymentLike[]; state: string; paymentDate: string } | undefined {
  const all = invoice.payments ?? [];
  if (!all.some((p) => p.bookingKey === bookingKey)) return undefined;
  const payments = all.filter((p) => p.bookingKey !== bookingKey);
  const open = openInvoiceAmount({
    state: invoice.state, totalAmount: invoice.totalAmount, accountingTenantId: '', reminders: invoice.reminders,
    payments: payments.map((p) => ({ date: p.date, amount: p.amount, bankAccountKey: p.bankAccountKey ?? '' })),
  }) > 0;
  let state = invoice.state;
  if (open && (state === 'paid' || state === 'partial')) {
    if ((invoice.bookingKey ?? '').startsWith('invoice-')) state = 'pending';
    else state = payments.length > 0 ? 'partial' : 'unpaid';
  }
  return { payments, state, paymentDate: latestDate(payments) };
}

/** The bill key of a native issue booking `bill-{key}`; undefined for a payment booking (`…-pay-…`) or any other key. */
export function issueBookingBillKey(bookingKey: string): string | undefined {
  const m = /^bill-([A-Za-z0-9]+)$/.exec(bookingKey);
  return m ? m[1] : undefined;
}

/** The note a linked booking carries (spec 1.85 B5): which bill it pays; the marker makes it findable. */
export function billPaymentNote(billId: string, title: string): string {
  return `Zahlung Kreditor ${[billId, title].filter((s) => !!s).join(' ')} [bill-payment]`;
}

/** The notes with `line` appended on its own line (not twice); capped at `maxLength` without cutting existing notes. */
export function withNoteLine(notes: string, line: string, maxLength: number): string {
  const lines = (notes ?? '').split('\n');
  if (lines.includes(line)) return notes ?? '';
  const prefix = notes ? `${notes}\n` : '';
  return prefix + line.substring(0, Math.max(0, maxLength - prefix.length));
}

/** The notes without the line `line` (unlink). */
export function withoutNoteLine(notes: string, line: string): string {
  return (notes ?? '').split('\n').filter((l) => l !== line).join('\n');
}
