import { BookingLineModel, BookingModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/** A single flattened row of the journal list view. */
export interface JournalRow {
  booking: BookingModel;
  okey: string;
  date: string;           // booking date formatted as dd.mm.yyyy
  year: number;           // booking year (from the yyyymmdd StoreDate)
  creditAccount: string;  // account id(s) of the credit line(s), comma-joined
  debitAccount: string;   // account id(s) of the debit line(s), comma-joined
  accountName: string;    // booking title / description text
  amount: string;         // balanced booking total, formatted (e.g. 1'234.50)
  currency: string;
}

/** Extract the four-digit year from a booking's yyyymmdd StoreDate (0 if unset). */
export function bookingYear(booking: BookingModel): number {
  const d = booking.date ?? '';
  return d.length >= 4 ? Number(d.substring(0, 4)) : 0;
}

/** Format a minor-unit amount (e.g. Rappen) as a Swiss-formatted major-unit string. */
export function formatMinorAmount(minor: number): string {
  return (minor / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Build a flattened journal row for a booking and its lines.
 * creditAccount / debitAccount hold the account id(s) (resolved via accountIdByKey);
 * amount is the balanced total (Σ creditAmount == Σ debitAmount for a valid booking).
 */
export function toJournalRow(
  booking: BookingModel,
  lines: BookingLineModel[],
  accountIdByKey: Map<string, string>,
): JournalRow {
  const creditIds = new Set<string>();
  const debitIds = new Set<string>();
  let total = 0;
  let currency = 'CHF';
  for (const line of lines) {
    const id = accountIdByKey.get(line.accountKey) ?? '';
    if (line.creditAmount) {
      if (id) creditIds.add(id);
      total += line.creditAmount.amount;
      currency = line.creditAmount.currency;
    }
    if (line.debitAmount) {
      if (id) debitIds.add(id);
      currency = line.debitAmount.currency;
    }
  }
  return {
    booking,
    okey: booking.okey,
    date: booking.date ? convertDateFormatToString(booking.date, DateFormat.StoreDate, DateFormat.ViewDate, false) : '',
    year: bookingYear(booking),
    creditAccount: [...creditIds].join(', '),
    debitAccount: [...debitIds].join(', '),
    accountName: booking.title,
    amount: formatMinorAmount(total),
    currency,
  };
}

/** Case-insensitive match of a journal row against a free-text search term. */
export function matchesJournalSearch(row: JournalRow, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return (
    row.accountName.toLowerCase().includes(t) ||
    row.creditAccount.toLowerCase().includes(t) ||
    row.debitAccount.toLowerCase().includes(t) ||
    row.date.includes(t) ||
    row.amount.includes(t) ||
    String(row.booking.bookingNo).includes(t)
  );
}

/** Flatten journal rows to a 2D string array (with header) for CSV export. */
export function journalToRows(
  rows: JournalRow[],
  headers: { date: string; credit: string; debit: string; name: string; amount: string },
): string[][] {
  return [
    [headers.date, headers.credit, headers.debit, headers.name, headers.amount],
    ...rows.map(r => [r.date, r.creditAccount, r.debitAccount, r.accountName, r.amount]),
  ];
}

export function validateBookingBalance(lines: BookingLineModel[]): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    debitTotal  += line.debitAmount?.amount  ?? 0;
    creditTotal += line.creditAmount?.amount ?? 0;
  }
  return debitTotal === creditTotal;
}

export function generateBookingNo(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}
