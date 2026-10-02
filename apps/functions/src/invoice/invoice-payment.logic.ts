/**
 * Pure payment and cancel rules for native invoices (spec 1.76 phase 2).
 * No Firestore access: the callables read the documents and feed them in here.
 * All amounts are Rappen.
 */

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

/** Refusal codes for recording a payment: not-payable, invalid-amount, overpayment, no-payment-date. */
export function paymentBlockers(invoice: InvoiceLike, amount: number, date: string): string[] {
  const blockers: string[] = [];
  if (invoice.state !== 'pending') blockers.push('not-payable');
  const valid = Number.isFinite(amount) && Number.isInteger(amount) && amount > 0;
  if (!valid) blockers.push('invalid-amount');
  else if (amount > openAmount(invoice)) blockers.push('overpayment');
  if (!date) blockers.push('no-payment-date');
  return blockers;
}

/** Appends the payment; the payment that completes the total flips the state to paid. */
export function applyInvoicePayment(invoice: InvoiceLike, p: PaymentInput): { payments: StoredPayment[]; state: string; paymentDate?: string } {
  const payments: StoredPayment[] = [
    ...(invoice.payments ?? []).map(x => ({ date: x.date, amount: x.amount, bankAccountKey: x.bankAccountKey, bookingKey: x.bookingKey ?? '' })),
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

/** Refusal codes for linking an existing booking as payment. */
export function linkBlockers(
  booking: { status?: string; accountingTenantId?: string } | undefined,
  lines: { accountKey: string; creditAmount?: { amount: number } | null }[],
  receivablesKey: string,
  accountingTenantId: string,
  amount: number,
  alreadyLinked: string[],
  bookingKey: string,
): string[] {
  if (!booking) return ['booking-not-found'];
  const blockers: string[] = [];
  if (booking.status !== 'posted') blockers.push('booking-not-posted');
  if (booking.accountingTenantId !== accountingTenantId) blockers.push('foreign-booking');
  const credited = lines.filter(l => l.accountKey === receivablesKey).reduce((s, l) => s + (l.creditAmount?.amount ?? 0), 0);
  if (credited < amount) blockers.push('no-receivables-credit');
  if (alreadyLinked.includes(bookingKey)) blockers.push('already-linked');
  return blockers;
}

/** A retry with an already stored booking key returns the stored payment instead of writing again. */
export function paymentDecision(existing: { bookingKey: string }[], bookingKey: string): 'write' | 'return-stored' {
  return existing.some(p => p.bookingKey === bookingKey) ? 'return-stored' : 'write';
}

/** Refusal codes for cancelling: not-cancellable, has-payments, no-issue-booking. */
export function cancelBlockers(invoice: InvoiceLike & { bookingKey?: string }, invoiceKey: string, issueBookingExists: boolean): string[] {
  const blockers: string[] = [];
  if (invoice.state !== 'pending') blockers.push('not-cancellable');
  if ((invoice.payments ?? []).length > 0) blockers.push('has-payments');
  if (invoice.bookingKey !== `invoice-${invoiceKey}` || !issueBookingExists) blockers.push('no-issue-booking');
  return blockers;
}

/** Swaps debit and credit on every line, keeping all other fields. */
export function reversalLines<T extends { debitAmount?: unknown; creditAmount?: unknown }>(lines: T[]): T[] {
  return lines.map(l => {
    const { debitAmount, creditAmount, ...rest } = l;
    const out: Record<string, unknown> = { ...rest };
    if (creditAmount !== undefined) out['debitAmount'] = creditAmount;
    if (debitAmount !== undefined) out['creditAmount'] = debitAmount;
    return out as T;
  });
}
