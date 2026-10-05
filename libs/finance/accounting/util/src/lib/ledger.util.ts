import { AccountModel, BookingLineModel, BookingModel, BookingStatus } from '@okr/shared-models';

/** An account as a ledger card shows it: number and name; an unknown account shows its key. */
export interface LedgerAccount { accountKey: string; accountId: string; accountName: string; }

/** One booking line on a ledger card: the account, the side and the amount in minor units. */
export interface LedgerLine extends LedgerAccount { side: 'debit' | 'credit'; amount: number; }

/** One booking of a document (invoice, bill …) with its lines. */
export interface LedgerBooking {
  bookingKey: string;
  date: string;          // StoreDate
  bookingNo: number;
  title: string;
  status: BookingStatus;
  lines: LedgerLine[];
}

/** The accounts in the given order, resolved to number and name. */
export function ledgerAccounts(accountKeys: string[], accounts: AccountModel[]): LedgerAccount[] {
  const byKey = new Map(accounts.map(a => [a.okey, a]));
  return accountKeys.map(accountKey => {
    const account = byKey.get(accountKey);
    return { accountKey, accountId: account?.id ?? accountKey, accountName: account?.name ?? '' };
  });
}

/**
 * The bookings named by `bookingKeys`, in that order, each with its lines (debit lines first, then
 * by account number). A key without a loaded booking is skipped: a derived key (e.g. a storno that
 * was never posted) or a booking deleted since.
 */
export function ledgerBookings(bookingKeys: string[], bookings: BookingModel[], lines: BookingLineModel[], accounts: AccountModel[]): LedgerBooking[] {
  const bookingByKey = new Map(bookings.map(b => [b.okey, b]));
  const linesByBooking = new Map<string, BookingLineModel[]>();
  for (const line of lines) {
    const list = linesByBooking.get(line.bookingKey);
    if (list) list.push(line);
    else linesByBooking.set(line.bookingKey, [line]);
  }
  const result: LedgerBooking[] = [];
  for (const key of new Set(bookingKeys)) {
    const booking = bookingByKey.get(key);
    if (!booking) continue;
    const bookingLines = linesByBooking.get(key) ?? [];
    const resolved = ledgerAccounts(bookingLines.map(l => l.accountKey), accounts);
    const ledgerLines: LedgerLine[] = bookingLines.map((line, i) => {
      const isDebit = (line.debitAmount?.amount ?? 0) !== 0;
      return { ...resolved[i], side: isDebit ? 'debit' : 'credit', amount: (isDebit ? line.debitAmount?.amount : line.creditAmount?.amount) ?? 0 };
    });
    ledgerLines.sort((a, b) => (a.side === b.side ? a.accountId.localeCompare(b.accountId, 'de', { numeric: true }) : a.side === 'debit' ? -1 : 1));
    result.push({ bookingKey: key, date: booking.date, bookingNo: booking.bookingNo, title: booking.title, status: booking.status, lines: ledgerLines });
  }
  return result;
}

/** The year (yyyy) of a StoreDate, or undefined when the date is not set. */
export function storeDateYear(storeDate: string | undefined): number | undefined {
  const year = Number((storeDate ?? '').substring(0, 4));
  return Number.isInteger(year) && year > 0 ? year : undefined;
}
