import { BillModel, BookingLineModel, BookingModel } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';

/** How an outgoing payment is recorded (spec 1.85): book it now, or point at an existing booking. */
export type BillPaymentMode = 'post' | 'link';

/**
 * The payment dialog's form model. Amounts are CHF (what the user types); the service converts them
 * to Rappen once, right before the callable. `openAmount` and `bookingAmount` are context the Vest
 * suite needs and the user never edits: the open amount of the bill and the amount the selected
 * booking debits to the payables account (0 while none is selected).
 */
export interface BillPaymentFormModel {
  mode: BillPaymentMode;
  date: string;              // StoreDate
  amount: number;            // CHF
  bankAccountKey: string;    // mode post
  bookingKey: string;        // mode link
  openAmount: number;        // CHF, read-only context
  bookingAmount: number;     // CHF, read-only context
}

/** A posted booking that debits the payables account — what mode `link` may point at. */
export interface BillPaymentCandidate {
  bookingKey: string;
  bookingNo: number;
  date: string;              // StoreDate
  title: string;
  debitedAmount: number;     // Rappen debited to the payables account
}

/** What the payment dialog returns to the store. */
export interface BillPaymentInput {
  mode: BillPaymentMode;
  date: string;
  amount: number;            // CHF
  bankAccountKey: string;
  bookingKey: string;
}

/** At most this many bookings are offered in mode `link`. */
export const MAX_BILL_PAYMENT_CANDIDATES = 50;

/** Bookings this many days before the bill date may still pay it (a payment entered before the bill). */
export const BILL_PAYMENT_LOOKBACK_DAYS = 30;

/** Posted bookings are read in pages of this size (oldest first) when looking for candidates. */
export const BILL_PAYMENT_BOOKING_PAGE = 300;

/** At most this many pages are read: 2'100 bookings, more than a busy club books in a year. */
export const BILL_PAYMENT_BOOKING_PAGES = 7;

/** A payment is looked for up to this many days after the later of bill and due date. */
export const BILL_PAYMENT_LOOKAHEAD_DAYS = 180;

/** Payment hints are only computed for open bills dated within this many days (old migrated open items would widen the read). */
export const BILL_PAYMENT_HINT_MAX_AGE_DAYS = 365;

/** The states that take a payment: an open bill (`todo`) and one bexio marked `overdue`. Same set as recordBillPayment. */
export const PAYABLE_BILL_STATES: readonly string[] = ['todo', 'overdue'];

/** True when a payment can be recorded on a bill in this state. */
export function isPayableBill(bill: Pick<BillModel, 'state'> | undefined): boolean {
  return !!bill?.state && PAYABLE_BILL_STATES.includes(bill.state);
}

/** Rappen still open on a bill: total minus the recorded payments, never negative (legacy docs may lack `payments`). */
export function openBillAmount(bill: Pick<BillModel, 'totalAmount' | 'payments'>): number {
  const paid = (bill.payments ?? []).reduce((sum, p) => sum + (p?.amount ?? 0), 0);
  return Math.max(0, (bill.totalAmount?.amount ?? 0) - paid);
}

/** Every payment booking key stored on the given bills — a booking pays one bill only. */
export function linkedBillPaymentKeys(bills: Pick<BillModel, 'payments'>[]): string[] {
  return bills.flatMap((b) => (b.payments ?? []).map((p) => p?.bookingKey ?? '')).filter((k) => k.length > 0);
}

/** The day from which bookings may pay this bill: the bill date minus the look-back, or '' without a bill date. */
export function billPaymentFromDate(bill: Pick<BillModel, 'billDate'>, lookbackDays = BILL_PAYMENT_LOOKBACK_DAYS): string {
  return bill.billDate ? addDuration(bill.billDate, { days: -lookbackDays }) : '';
}

/**
 * The initial form of a payment dialog: dated today, the full open amount, mode `post` when the
 * accounting config names bill payment accounts (the first one preselected), otherwise `link`. A
 * preselected booking (the hint, Q4) opens mode `link` with that booking's amount and date.
 */
export function newBillPaymentFormModel(
  bill: BillModel, today: string, paymentAccountKeys: string[], preselect?: BillPaymentCandidate,
): BillPaymentFormModel {
  const open = openBillAmount(bill) / 100;
  const canPost = paymentAccountKeys.length > 0;
  if (preselect) {
    const bookingAmount = preselect.debitedAmount / 100;
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
 * The bookings a bill payment may be linked to: posted bookings with at least one line debiting the
 * payables account, dated `fromDate` or later, oldest first and capped. Left out are bookings already
 * linked on any bill and the bookings okr writes itself (`bill-…`, `invoice-…`).
 * @param lines the lines of the given bookings (lines on other accounts and archived lines are ignored)
 * @param bookings booking headers (any order; only `posted` ones qualify)
 */
export function billPaymentCandidates(
  lines: Pick<BookingLineModel, 'bookingKey' | 'accountKey' | 'debitAmount' | 'isArchived'>[],
  bookings: Pick<BookingModel, 'okey' | 'bookingNo' | 'date' | 'title' | 'status' | 'isArchived'>[],
  payablesAccountKey: string,
  linkedBookingKeys: string[],
  fromDate = '',
  cap = MAX_BILL_PAYMENT_CANDIDATES,
): BillPaymentCandidate[] {
  if (!payablesAccountKey) return [];
  const debited = new Map<string, number>();
  for (const line of lines) {
    if (line.accountKey !== payablesAccountKey || line.isArchived === true) continue;
    const amount = line.debitAmount?.amount ?? 0;
    if (amount <= 0) continue;
    debited.set(line.bookingKey, (debited.get(line.bookingKey) ?? 0) + amount);
  }
  const linked = new Set(linkedBookingKeys);
  return bookings
    .filter((b) => b.status === 'posted' && b.isArchived !== true && debited.has(b.okey) && !linked.has(b.okey)
      && !b.okey.startsWith('bill-') && !b.okey.startsWith('invoice-') && (b.date ?? '') >= fromDate)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.bookingNo ?? 0) - (b.bookingNo ?? 0))
    .slice(0, cap)
    .map((b) => ({ bookingKey: b.okey, bookingNo: b.bookingNo ?? 0, date: b.date ?? '', title: b.title ?? '', debitedAmount: debited.get(b.okey) ?? 0 }));
}

/**
 * The likely payment of each open bill (spec 1.85 Q4): a candidate that debits exactly the open
 * amount, dated no earlier than the bill date minus the look-back. Bills are served oldest first and
 * each booking is used for one bill only; among several matches the earliest booking wins.
 * @returns billKey → bookingKey (bills without a match are absent)
 */
export function billPaymentHints(
  bills: BillModel[], candidates: BillPaymentCandidate[], lookbackDays = BILL_PAYMENT_LOOKBACK_DAYS,
): Map<string, string> {
  const hints = new Map<string, string>();
  const used = new Set<string>();
  const open = bills
    .filter((b) => isPayableBill(b) && openBillAmount(b) > 0 && !!b.okey)
    .sort((a, b) => (a.billDate ?? '').localeCompare(b.billDate ?? '') || a.okey.localeCompare(b.okey));
  const sorted = [...candidates].sort((a, b) => a.date.localeCompare(b.date) || a.bookingNo - b.bookingNo);
  for (const bill of open) {
    const amount = openBillAmount(bill);
    const from = billPaymentFromDate(bill, lookbackDays);
    const match = sorted.find((c) => !used.has(c.bookingKey) && c.debitedAmount === amount && c.date >= from);
    if (!match) continue;
    used.add(match.bookingKey);
    hints.set(bill.okey, match.bookingKey);
  }
  return hints;
}

/**
 * The date window in which a bill's payment is looked for: from the bill date minus the look-back to
 * the later of bill and due date plus the look-ahead, but never past today. Undefined without a bill date.
 */
export function billPaymentWindow(bill: Pick<BillModel, 'billDate' | 'dueDate'>, today: string): { from: string; to: string } | undefined {
  if (!bill.billDate) return undefined;
  const latest = (bill.dueDate ?? '') > bill.billDate ? bill.dueDate : bill.billDate;
  const end = addDuration(latest, { days: BILL_PAYMENT_LOOKAHEAD_DAYS });
  return { from: billPaymentFromDate(bill), to: end < today ? end : today };
}

/**
 * The open bills that get a payment hint (dated within BILL_PAYMENT_HINT_MAX_AGE_DAYS) and the one
 * window that covers them all (earliest start until today); undefined when there is none.
 */
export function billPaymentHintWindow(openBills: BillModel[], today: string): { bills: BillModel[]; from: string; to: string } | undefined {
  const oldest = addDuration(today, { days: -BILL_PAYMENT_HINT_MAX_AGE_DAYS });
  const bills = openBills.filter((b) => !!b.billDate && b.billDate >= oldest);
  const from = earliestPaymentFromDate(bills);
  return from ? { bills, from, to: today } : undefined;
}

/** The earliest day any of the bills may be paid from (for one candidate read covering all of them), or ''. */
export function earliestPaymentFromDate(bills: Pick<BillModel, 'billDate'>[], lookbackDays = BILL_PAYMENT_LOOKBACK_DAYS): string {
  const dates = bills.map((b) => billPaymentFromDate(b, lookbackDays)).filter((d) => d.length > 0).sort();
  return dates[0] ?? '';
}

/** The refusal reasons of a failed bill callable (`details.reasons` of a blocked call, else `details.reason`). */
export function billRefusalReasons(error: unknown): string[] {
  const e = error as { code?: string; details?: { reason?: unknown; reasons?: unknown } } | undefined;
  const details = e?.details;
  if (Array.isArray(details?.reasons) && details.reasons.length > 0) return details.reasons.map((r) => String(r));
  if (typeof details?.reason === 'string' && details.reason) return [details.reason];
  if (e?.code === 'functions/not-found' || e?.code === 'not-found') return ['not-found'];
  return [];
}

/**
 * Refusals the payment dialog cannot fix: the bill is not payable (anymore), the books are not set up
 * for it, or the server state needs a look. Everything else lets the treasurer try again in the same
 * dialog (same payment id).
 */
const FINAL_BILL_PAYMENT_REFUSALS = [
  'invalid-payment-id', 'not-payable', 'not-found', 'no-accounting-config', 'foreign-accounting-tenant', 'bexio-backend',
  'inconsistent-state', 'no-payables-account',
];

/** True when the payment dialog should open again (with the same payment id) after this refusal. */
export function isRetryableBillPaymentRefusal(reasons: string[]): boolean {
  return !reasons.some((r) => FINAL_BILL_PAYMENT_REFUSALS.includes(r));
}
