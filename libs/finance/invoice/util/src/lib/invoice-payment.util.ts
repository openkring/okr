import { BookingLineModel, BookingModel, InvoiceModel } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';

/** How a received payment is recorded (spec 1.76 phase 2): book it now, or point at an existing bank booking. */
export type InvoicePaymentMode = 'post' | 'link';

/**
 * The payment dialog's form model. Amounts are CHF (what the user types); the service converts them
 * to Rappen once, right before the callable. `openAmount` and `bookingAmount` are context the Vest
 * suite needs and the user never edits: the open amount of the invoice and the amount the selected
 * bank booking credits to the receivables account (0 while none is selected).
 */
export interface InvoicePaymentFormModel {
  mode: InvoicePaymentMode;
  date: string;              // StoreDate
  amount: number;            // CHF
  bankAccountKey: string;    // mode post
  bookingKey: string;        // mode link
  openAmount: number;        // CHF, read-only context
  bookingAmount: number;     // CHF, read-only context
}

/** A posted bank booking that credits the receivables account — what mode `link` may point at. */
export interface InvoicePaymentCandidate {
  bookingKey: string;
  bookingNo: number;
  date: string;              // StoreDate
  title: string;
  creditedAmount: number;    // Rappen credited to the receivables account
}

/** What the payment dialog returns to the store. */
export interface InvoicePaymentInput {
  mode: InvoicePaymentMode;
  date: string;
  amount: number;            // CHF
  bankAccountKey: string;
  bookingKey: string;
}

/** At most this many bookings are offered in mode `link`. */
export const MAX_PAYMENT_CANDIDATES = 50;

/** At most this many posted bookings (the earliest from the look-back start on) are read when looking for link candidates. */
export const PAYMENT_CANDIDATE_BOOKING_LIMIT = 200;

/**
 * Booking keys per `bookingKey in [...]` read. Firestore allows 30 disjunctions per query, and the
 * tenant filter (`tenants array-contains-any [tenant, 'system']`) doubles them: 15 × 2 = 30.
 */
export const BOOKING_KEY_CHUNK_SIZE = 15;

/** Splits a list into consecutive chunks of at most `size` items. */
export function chunked<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) {
    result.push(items.slice(i, i + Math.max(1, size)));
  }
  return result;
}

/**
 * The bookings worth reading lines for: not one okr writes for invoices itself (`invoice-…`: the
 * issue booking, a reversal, another invoice's payment) and not already linked on this invoice.
 */
export function linkableBookings<T extends Pick<BookingModel, 'okey'>>(bookings: T[], linkedBookingKeys: string[]): T[] {
  const linked = new Set(linkedBookingKeys);
  return bookings.filter((b) => !b.okey.startsWith('invoice-') && !linked.has(b.okey));
}

/** waiveReminderFee accepts a reason of 1 to this many characters (server: WAIVE_REASON_MAX). */
export const WAIVE_REASON_MAX = 500;

/** cancelInvoice accepts a reason of 1 to this many characters. */
export const INVOICE_CANCEL_REASON_LENGTH = 500;

/** Length of a client-generated payment id (the server accepts 8 to 32 letters or digits). */
export const PAYMENT_ID_LENGTH = 20;
const PAYMENT_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A random idempotency key for one payment dialog: 20 letters or digits. Generated once when the
 * dialog opens and reused on every retry of that dialog, so a resent call cannot book twice.
 */
export function newPaymentId(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = randomBytes(PAYMENT_ID_LENGTH);
  let id = '';
  for (let i = 0; i < PAYMENT_ID_LENGTH; i++) {
    id += PAYMENT_ID_ALPHABET[(bytes[i] ?? 0) % PAYMENT_ID_ALPHABET.length];
  }
  return id;
}

/** True when the fee of a reminder was waived (spec 1.76 D18): `waivedAt` is a non-empty StoreDate. */
export function isWaivedReminder(reminder: { waivedAt?: string } | undefined): boolean {
  return typeof reminder?.waivedAt === 'string' && reminder.waivedAt.length > 0;
}

/** Sum of the reminder fees in Rappen; waived fees and a missing or non-finite fee (legacy reminder) count as 0. */
export function reminderFeeSum(reminders: { fee?: number; waivedAt?: string }[] | undefined): number {
  return (reminders ?? []).reduce((s, r) => s + (isWaivedReminder(r) || !Number.isFinite(r.fee) ? 0 : (r.fee as number)), 0);
}

/** Rappen still open on an invoice: total plus reminder fees minus the recorded payments, never negative. */
export function openInvoiceAmount(invoice: Pick<InvoiceModel, 'totalAmount' | 'payments'> & { reminders?: { fee?: number; waivedAt?: string }[] }): number {
  const paid = (invoice.payments ?? []).reduce((sum, p) => sum + (p?.amount ?? 0), 0);
  return Math.max(0, (invoice.totalAmount?.amount ?? 0) + reminderFeeSum(invoice.reminders) - paid);
}

/** CHF with two decimals, e.g. 1234.5 → '1234.50'. */
export function formatPaymentChf(rappen: number): string {
  return ((rappen ?? 0) / 100).toFixed(2);
}

/**
 * The initial form of a payment dialog: dated today, the full open amount, mode `post` when the
 * accounting config names payment accounts (the first one preselected), otherwise `link`. A
 * preselected booking (the list's payment hint, spec 1.86) opens mode `link` with its amount and date.
 */
export function newInvoicePaymentFormModel(
  invoice: InvoiceModel, today: string, paymentAccountKeys: string[], preselect?: InvoicePaymentCandidate,
): InvoicePaymentFormModel {
  const open = openInvoiceAmount(invoice) / 100;
  const canPost = paymentAccountKeys.length > 0;
  if (preselect) {
    const bookingAmount = preselect.creditedAmount / 100;
    return {
      mode: 'link', date: preselect.date || today, amount: Math.min(bookingAmount, open),
      bankAccountKey: canPost ? paymentAccountKeys[0] : '', bookingKey: preselect.bookingKey, openAmount: open, bookingAmount,
    };
  }
  return {
    mode: canPost ? 'post' : 'link',
    date: today,
    amount: open,
    bankAccountKey: canPost ? paymentAccountKeys[0] : '',
    bookingKey: '',
    openAmount: open,
    bookingAmount: 0,
  };
}

/**
 * The bank bookings a payment may be linked to: posted bookings with at least one line crediting
 * the receivables account, newest first. Above MAX_PAYMENT_CANDIDATES the oldest ones are kept — the
 * bookings are read from shortly before the invoice date on, so the oldest are the ones closest to
 * the invoice and a stream of newer bookings never pushes them out. Left out are bookings
 * already linked on this invoice and the bookings okr writes for invoices itself (`invoice-…`: the
 * issue booking, a reversal, another invoice's payment) — none of them is a received payment to link.
 * @param lines the lines of the given bookings (lines on other accounts are ignored)
 * @param bookings booking headers (any order; only `posted` ones qualify)
 */
export function invoicePaymentCandidates(
  lines: Pick<BookingLineModel, 'bookingKey' | 'accountKey' | 'creditAmount'>[],
  bookings: Pick<BookingModel, 'okey' | 'bookingNo' | 'date' | 'title' | 'status'>[],
  receivablesAccountKey: string,
  linkedBookingKeys: string[],
  cap = MAX_PAYMENT_CANDIDATES,
): InvoicePaymentCandidate[] {
  const credited = new Map<string, number>();
  for (const line of lines) {
    if (line.accountKey !== receivablesAccountKey) continue;
    const amount = line.creditAmount?.amount ?? 0;
    if (amount <= 0) continue;
    credited.set(line.bookingKey, (credited.get(line.bookingKey) ?? 0) + amount);
  }
  return linkableBookings(bookings, linkedBookingKeys)
    .filter((b) => b.status === 'posted' && credited.has(b.okey))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.bookingNo ?? 0) - (b.bookingNo ?? 0))
    .slice(0, cap)
    .reverse()
    .map((b) => ({
      bookingKey: b.okey, bookingNo: b.bookingNo ?? 0, date: b.date ?? '', title: b.title ?? '',
      creditedAmount: credited.get(b.okey) ?? 0,
    }));
}

/** Payment hints are only computed for open invoices dated within this many days (spec 1.86 phase 1). */
export const INVOICE_PAYMENT_HINT_MAX_AGE_DAYS = 365;

/** A booking this many days before the invoice date may still be its payment (as in the payment dialog). */
export const INVOICE_PAYMENT_HINT_LOOKBACK_DAYS = 7;

/** Every payment booking already linked on one of the invoices. */
export function linkedInvoicePaymentKeys(invoices: Pick<InvoiceModel, 'payments'>[]): string[] {
  return invoices.flatMap((i) => (i.payments ?? []).map((p) => p?.bookingKey ?? '')).filter((k) => !!k);
}

/**
 * The likely payment of each open invoice (spec 1.86 phase 1): a candidate that credits exactly the
 * open amount, dated no earlier than the invoice date minus the look-back. Invoices are served oldest
 * first and each booking is used for one invoice only; among several matches the earliest booking wins.
 * @returns invoiceKey → bookingKey (invoices without a match are absent)
 */
export function invoicePaymentHints(
  invoices: InvoiceModel[], candidates: InvoicePaymentCandidate[], lookbackDays = INVOICE_PAYMENT_HINT_LOOKBACK_DAYS,
): Map<string, string> {
  const hints = new Map<string, string>();
  const used = new Set<string>();
  const open = invoices
    .filter((i) => isPayableState(i.state) && openInvoiceAmount(i) > 0 && !!i.okey && !!i.invoiceDate)
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.okey.localeCompare(b.okey));
  const sorted = [...candidates].sort((a, b) => a.date.localeCompare(b.date) || a.bookingNo - b.bookingNo);
  for (const invoice of open) {
    const amount = openInvoiceAmount(invoice);
    const from = addDuration(invoice.invoiceDate, { days: -lookbackDays });
    const match = sorted.find((c) => !used.has(c.bookingKey) && c.creditedAmount === amount && c.date >= from);
    if (!match) continue;
    used.add(match.bookingKey);
    hints.set(invoice.okey, match.bookingKey);
  }
  return hints;
}

/**
 * The open invoices that get a payment hint (dated within INVOICE_PAYMENT_HINT_MAX_AGE_DAYS) and the
 * one read window that covers them all (earliest look-back start until today); undefined when there is none.
 */
export function invoicePaymentHintWindow(openInvoices: InvoiceModel[], today: string): { invoices: InvoiceModel[]; from: string; to: string } | undefined {
  const oldest = addDuration(today, { days: -INVOICE_PAYMENT_HINT_MAX_AGE_DAYS });
  const invoices = openInvoices.filter((i) => !!i.invoiceDate && i.invoiceDate >= oldest);
  const starts = invoices.map((i) => addDuration(i.invoiceDate, { days: -INVOICE_PAYMENT_HINT_LOOKBACK_DAYS })).sort();
  return starts.length > 0 ? { invoices, from: starts[0], to: today } : undefined;
}

/** The drafts among the given invoices — what "Alle Entwürfe ausstellen" issues. */
export function draftInvoicesOf(invoices: InvoiceModel[]): InvoiceModel[] {
  return invoices.filter((i) => i.state === 'draft');
}

/**
 * Why a cancel input is not accepted yet: an empty or too long reason, a missing date, or a date
 * before the invoice date (`before-invoice`, the same rule as cancelInvoice's storno-before-invoice).
 */
export function cancelInputProblem(reason: string, date: string, invoiceDate?: string): 'reason' | 'date' | 'before-invoice' | undefined {
  const trimmed = (reason ?? '').trim();
  if (trimmed.length === 0 || trimmed.length > INVOICE_CANCEL_REASON_LENGTH) return 'reason';
  if (!/^\d{8}$/.test(date ?? '')) return 'date';
  if (invoiceDate && date < invoiceDate) return 'before-invoice';
  return undefined;
}

/**
 * The states that take a payment: an issued open invoice (`pending`) and the open items migrated
 * from bexio (`partial`, `unpaid`). Same set as the recordInvoicePayment callable.
 */
export const PAYABLE_INVOICE_STATES: readonly string[] = ['pending', 'partial', 'unpaid'];

/** True when a payment can be recorded on an invoice in this state. */
export function isPayableState(state: string | undefined): boolean {
  return !!state && PAYABLE_INVOICE_STATES.includes(state);
}

/**
 * Refusals the payment dialog cannot fix: the invoice is not payable (anymore), the books are not
 * set up for it, the server state needs a look, or the dialog's own payment id was refused (a retry
 * would send the same id again). Every other refusal — a wrong amount, date,
 * account or booking, a locked period, a concurrent change — and an error without a reason (a
 * network failure) lets the treasurer try again in the same dialog.
 */
const FINAL_PAYMENT_REFUSALS = ['invalid-payment-id', 'not-payable', 'not-found', 'no-accounting-config', 'foreign-accounting-tenant', 'bexio-backend', 'inconsistent-state'];

/** True when the payment dialog should open again (with the same payment id) after this refusal. */
export function isRetryablePaymentRefusal(reasons: string[]): boolean {
  return !reasons.some((r) => FINAL_PAYMENT_REFUSALS.includes(r));
}
