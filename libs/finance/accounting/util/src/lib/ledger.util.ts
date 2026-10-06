import { AccountModel, BookingLineModel, BookingModel, BookingStatus } from '@okr/shared-models';

/** An account as a ledger card shows it: number and name; an unknown account shows its key. */
export interface LedgerAccount { accountKey: string; accountId: string; accountName: string; }

/** One booking of a document (invoice, bill …) as a journal row: Soll against Haben for the total. */
export interface LedgerBooking {
  bookingKey: string;
  date: string;          // StoreDate
  bookingNo: number;
  title: string;
  status: BookingStatus;
  debit: LedgerAccount[];   // the distinct Soll accounts, by account number
  credit: LedgerAccount[];  // the distinct Haben accounts, by account number
  amount: number;           // the document's share in minor units, else the balanced total (Σ credit)
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
 * The bookings named by `bookingKeys`, in that order, each as a journal row: its Soll and Haben
 * accounts (each once, by account number — a split booking has several on one side) and its total.
 * A key without a loaded booking is skipped: a derived key (e.g. a storno that was never posted) or
 * a booking deleted since.
 * `amounts` holds the document's own share of a booking (bookingKey → minor units): a collective
 * payment settles several documents in one booking, and its total is not this document's amount.
 */
export function ledgerBookings(bookingKeys: string[], bookings: BookingModel[], lines: BookingLineModel[], accounts: AccountModel[],
  amounts: Record<string, number> = {}): LedgerBooking[] {
  const bookingByKey = new Map(bookings.map(b => [b.okey, b]));
  const linesByBooking = new Map<string, BookingLineModel[]>();
  for (const line of lines) {
    const list = linesByBooking.get(line.bookingKey);
    if (list) list.push(line);
    else linesByBooking.set(line.bookingKey, [line]);
  }
  const sideAccounts = (sideLines: BookingLineModel[]): LedgerAccount[] =>
    ledgerAccounts([...new Set(sideLines.map(l => l.accountKey))], accounts)
      .sort((a, b) => a.accountId.localeCompare(b.accountId, 'de', { numeric: true }));
  const result: LedgerBooking[] = [];
  for (const key of new Set(bookingKeys)) {
    const booking = bookingByKey.get(key);
    if (!booking) continue;
    const bookingLines = linesByBooking.get(key) ?? [];
    const creditLines = bookingLines.filter(l => (l.creditAmount?.amount ?? 0) !== 0);
    result.push({
      bookingKey: key, date: booking.date, bookingNo: booking.bookingNo, title: booking.title, status: booking.status,
      debit: sideAccounts(bookingLines.filter(l => (l.debitAmount?.amount ?? 0) !== 0)),
      credit: sideAccounts(creditLines),
      amount: amounts[key] ?? creditLines.reduce((sum, l) => sum + (l.creditAmount?.amount ?? 0), 0),
    });
  }
  return result;
}

/** The year (yyyy) of a StoreDate, or undefined when the date is not set. */
export function storeDateYear(storeDate: string | undefined): number | undefined {
  const year = Number((storeDate ?? '').substring(0, 4));
  return Number.isInteger(year) && year > 0 ? year : undefined;
}
