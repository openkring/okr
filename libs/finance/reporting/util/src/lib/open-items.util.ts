import { BillModel, BookingLineModel, BookingModel, InvoiceModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/**
 * Offene-Posten-Abstimmung (spec 1.86): the open bills (invoices) at a cut-off date against the balance
 * of the Kreditoren (Debitoren) account, and the bookings and documents that explain a difference.
 * Pure functions over the documents and the ledger; amounts are Rappen.
 */

/** Kreditoren (bills, `payablesAccountKey`) or Debitoren (invoices, `receivablesAccountKey`). */
export type OpenItemsSide = 'payables' | 'receivables';

/** A bill or invoice that is open at the cut-off. */
export interface OpenItemDocument {
  kind: 'bill' | 'invoice';
  key: string;
  label: string;        // document number, else vendor/receiver, else title
  date: string;         // StoreDate of the bill/invoice
  openAmount: number;   // Rappen open at the cut-off
}

/**
 * A document of the scope whose own bookings on the account do not add up to its open amount at the
 * cut-off: booked with another amount, booked on another account, or paid by a booking off the account.
 */
export interface OpenItemsDocumentDifference extends OpenItemDocument {
  bookedAmount: number;  // net of the document's bookings on the account (loading the account = +)
  delta: number;         // openAmount - bookedAmount: its share of the difference
}

/** A booking on the account that no document claims; `amount` is always positive. */
export interface OpenItemsBooking {
  bookingKey: string;
  bookingNo: number;
  date: string;
  title: string;
  amount: number;
}

export interface OpenItemsResult {
  side: OpenItemsSide;
  configured: boolean;                    // false: the books name no account for this side
  cutoff: string;
  start: string;                          // rows dated earlier are summed into carriedForward
  openTotal: number;
  balance: number;                        // payables credit-positive, receivables debit-positive
  difference: number;                     // openTotal - balance
  documents: OpenItemDocument[];          // open at the cut-off, oldest first
  unclaimedPayments: OpenItemsBooking[];  // clear the account without a document
  unclaimedCharges: OpenItemsBooking[];   // load the account without a document
  documentDifferences: OpenItemsDocumentDifference[]; // dated in the scope, booked differently from their open amount
  carriedForward: number;                 // what the documents and bookings dated before the scope start leave
}

export interface OpenItemsInput {
  side: OpenItemsSide;
  accountKey: string;
  cutoff: string;
  start: string;
  bills: BillModel[];
  invoices: InvoiceModel[];
  bookings: BookingModel[];
  lines: BookingLineModel[];
}

/** States in which a document is not (yet / any more) an open item. */
const NOT_OPEN_BILL_STATES = ['draft'];
const NOT_OPEN_INVOICE_STATES = ['draft', 'issuing'];

/** Sum of the payments dated on or before the cut-off. */
function paidUntil(payments: { date: string; amount: number }[] | undefined, cutoff: string): number {
  return (payments ?? []).reduce((sum, p) => sum + (p?.date && p.date <= cutoff ? (p.amount ?? 0) : 0), 0);
}

/**
 * A migrated document marked paid without any payment rows (bexio carried none): it counts as paid on
 * its `paymentDate`, or always when that is empty. A document with payments is judged by their dates.
 */
function paidByState(state: string, paymentDate: string, payments: unknown[] | undefined, cutoff: string): boolean {
  return state === 'paid' && (payments ?? []).length === 0 && (!paymentDate || paymentDate <= cutoff);
}

/** Rappen open on a bill at the cut-off: total minus the payments made by then, never negative. */
export function billOpenAmountAt(bill: BillModel, cutoff: string): number {
  if (bill.isArchived === true || NOT_OPEN_BILL_STATES.includes(bill.state) || !bill.billDate || bill.billDate > cutoff) return 0;
  if (paidByState(bill.state, bill.paymentDate ?? '', bill.payments, cutoff)) return 0;
  return Math.max(0, (bill.totalAmount?.amount ?? 0) - paidUntil(bill.payments, cutoff));
}

/**
 * Rappen open on an invoice at the cut-off: total plus the reminder fees charged by then and not waived
 * by then, minus the payments received by then, never negative. A cancelled invoice stays open until
 * its storno date (`cancelledOn`, the date of `invoice-{key}-storno`); without one it is not open.
 */
export function invoiceOpenAmountAt(invoice: InvoiceModel, cutoff: string, cancelledOn = ''): number {
  if (invoice.isArchived === true || NOT_OPEN_INVOICE_STATES.includes(invoice.state) || !invoice.invoiceDate || invoice.invoiceDate > cutoff) return 0;
  if (invoice.state === 'cancelled' && (!cancelledOn || cancelledOn <= cutoff)) return 0;
  if (paidByState(invoice.state, invoice.paymentDate ?? '', invoice.payments, cutoff)) return 0;
  const fees = (invoice.reminders ?? []).reduce((sum, r) => {
    const charged = !!r?.date && r.date <= cutoff;
    const waived = !!r?.waivedAt && r.waivedAt <= cutoff;
    return sum + (charged && !waived && Number.isFinite(r.fee) ? r.fee : 0);
  }, 0);
  return Math.max(0, (invoice.totalAmount?.amount ?? 0) + fees - paidUntil(invoice.payments, cutoff));
}

/** True when the key is `prefix` itself or one of the deterministic keys derived from it (`prefix-…`). */
function isOwnKey(bookingKey: string, prefix: string): boolean {
  return bookingKey === prefix || bookingKey.startsWith(prefix + '-');
}

/** True when the bill links the booking: its own booking(s), a payment, or a `bill-{okey}…` key. */
export function billClaimsBooking(bill: BillModel, bookingKey: string): boolean {
  if (!bookingKey) return false;
  if (isOwnKey(bookingKey, `bill-${bill.okey}`)) return true;
  if ((bill.bookingKeys ?? []).includes(bookingKey)) return true;
  return (bill.payments ?? []).some((p) => p?.bookingKey === bookingKey);
}

/** True when the invoice links the booking: issue, migrated bookings, payments, reminder fees, or `invoice-{okey}…`. */
export function invoiceClaimsBooking(invoice: InvoiceModel, bookingKey: string): boolean {
  if (!bookingKey) return false;
  if (isOwnKey(bookingKey, `invoice-${invoice.okey}`)) return true;
  if (invoice.bookingKey === bookingKey || (invoice.bookingKeys ?? []).includes(bookingKey)) return true;
  if ((invoice.payments ?? []).some((p) => p?.bookingKey === bookingKey)) return true;
  return (invoice.reminders ?? []).some((r) => r?.bookingKey === bookingKey || r?.waiveBookingKey === bookingKey);
}

function billLabel(bill: BillModel): string {
  return bill.billId || bill.vendor?.label || bill.title || bill.okey;
}

function invoiceLabel(invoice: InvoiceModel): string {
  return invoice.invoiceId || invoice.receiver?.label || invoice.title || invoice.okey;
}

/** The document without its claim test. */
function toDocument(d: OpenItemDocument): OpenItemDocument {
  return { kind: d.kind, key: d.key, label: d.label, date: d.date, openAmount: d.openAmount };
}

const sumAmounts = (rows: { amount: number }[]): number => rows.reduce((s, r) => s + r.amount, 0);

function emptyResult(input: OpenItemsInput): OpenItemsResult {
  return {
    side: input.side, configured: false, cutoff: input.cutoff, start: input.start,
    openTotal: 0, balance: 0, difference: 0,
    documents: [], unclaimedPayments: [], unclaimedCharges: [], documentDifferences: [], carriedForward: 0,
  };
}

/**
 * Reconciles one side of the books at the cut-off (spec 1.86 D3–D5). Every posted booking on the
 * account up to the cut-off belongs to the first document that claims it, or to none. Then
 * `difference = Σ unclaimedPayments − Σ unclaimedCharges + Σ documentDifferences.delta + carriedForward`,
 * where the listed rows cover the scope (dated from `start`) and `carriedForward` is exactly what the
 * documents and unclaimed bookings dated before the scope start contribute.
 */
export function computeOpenItems(input: OpenItemsInput): OpenItemsResult {
  const { side, accountKey, cutoff, start } = input;
  if (!accountKey) return emptyResult(input);

  // a cancelled invoice is open until its storno booking — look the date up among all bookings
  const bookingDates = new Map(input.bookings.filter((b) => b.status === 'posted' && b.isArchived !== true).map((b) => [b.okey, b.date ?? '']));
  const documents: (OpenItemDocument & { claims: (bookingKey: string) => boolean })[] = side === 'payables'
    ? input.bills.filter((b) => !NOT_OPEN_BILL_STATES.includes(b.state)).map((b) => ({
      kind: 'bill' as const, key: b.okey, label: billLabel(b), date: b.billDate ?? '', openAmount: billOpenAmountAt(b, cutoff),
      claims: (k: string) => billClaimsBooking(b, k),
    }))
    : input.invoices.filter((i) => !NOT_OPEN_INVOICE_STATES.includes(i.state)).map((i) => ({
      kind: 'invoice' as const, key: i.okey, label: invoiceLabel(i), date: i.invoiceDate ?? '',
      openAmount: invoiceOpenAmountAt(i, cutoff, bookingDates.get(`invoice-${i.okey}-storno`) ?? ''),
      claims: (k: string) => invoiceClaimsBooking(i, k),
    }));
  documents.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const open = documents.filter((d) => d.openAmount > 0);

  // the account's net movement per posted booking up to the cut-off, signed so that + loads the account
  const bookingsByKey = new Map<string, BookingModel>();
  for (const b of input.bookings) {
    if (b.status === 'posted' && b.isArchived !== true && !!b.date && b.date <= cutoff) bookingsByKey.set(b.okey, b);
  }
  const net = new Map<string, number>();
  for (const l of input.lines) {
    if (l.accountKey !== accountKey || l.isArchived === true || !bookingsByKey.has(l.bookingKey)) continue;
    const debit = l.debitAmount?.amount ?? 0;
    const credit = l.creditAmount?.amount ?? 0;
    const signed = side === 'payables' ? credit - debit : debit - credit;
    net.set(l.bookingKey, (net.get(l.bookingKey) ?? 0) + signed);
  }
  const balance = [...net.values()].reduce((s, v) => s + v, 0);

  // each booking on the account goes to the first (oldest) document that claims it
  const booked = new Map<string, number>();
  const unclaimedPayments: OpenItemsBooking[] = [];
  const unclaimedCharges: OpenItemsBooking[] = [];
  const sortedKeys = [...net.keys()].sort((a, b) => {
    const x = bookingsByKey.get(a) as BookingModel;
    const y = bookingsByKey.get(b) as BookingModel;
    return x.date.localeCompare(y.date) || (x.bookingNo ?? 0) - (y.bookingNo ?? 0) || a.localeCompare(b);
  });
  for (const key of sortedKeys) {
    const amount = net.get(key) ?? 0;
    const owner = documents.find((d) => d.claims(key));
    if (owner) {
      booked.set(owner.key, (booked.get(owner.key) ?? 0) + amount);
      continue;
    }
    const b = bookingsByKey.get(key) as BookingModel;
    if (amount === 0 || b.date < start) continue;
    const row = { bookingKey: key, bookingNo: b.bookingNo ?? 0, date: b.date, title: b.title ?? '', amount: Math.abs(amount) };
    (amount < 0 ? unclaimedPayments : unclaimedCharges).push(row);
  }

  // documents of the scope whose bookings on the account do not match what is open
  const documentDifferences: OpenItemsDocumentDifference[] = documents
    .filter((d) => d.date >= start && d.date <= cutoff)
    .map((d) => {
      const bookedAmount = booked.get(d.key) ?? 0;
      return { ...toDocument(d), bookedAmount, delta: d.openAmount - bookedAmount };
    })
    .filter((d) => d.delta !== 0);

  const openTotal = open.reduce((s, d) => s + d.openAmount, 0);
  const difference = openTotal - balance;
  const explained = sumAmounts(unclaimedPayments) - sumAmounts(unclaimedCharges) + documentDifferences.reduce((s, d) => s + d.delta, 0);
  return {
    side, configured: true, cutoff, start, openTotal, balance, difference,
    documents: open.map(toDocument),
    unclaimedPayments, unclaimedCharges, documentDifferences,
    carriedForward: difference - explained,
  };
}

/** A CSV cell, quoted when it holds the separator, a quote or a line break. */
function csvCell(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The open documents as CSV (the Offene-Posten-Liste for the closing, spec 1.86): view date, document
 * label and open amount in CHF; `;`-separated like the other finance exports.
 */
export function openItemsToCsv(documents: OpenItemDocument[]): string {
  const viewDate = (d: string) => convertDateFormatToString(d, DateFormat.StoreDate, DateFormat.ViewDate, false) || d;
  const rows = documents.map((d) => [viewDate(d.date), csvCell(d.label), (d.openAmount / 100).toFixed(2)].join(';'));
  return ['date;document;open', ...rows].join('\n');
}
