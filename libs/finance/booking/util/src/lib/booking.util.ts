import { AvatarInfo, BookingLineModel, BookingModel, MoneyModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/** A single flattened row of the journal list view. */
export interface JournalRow {
  booking: BookingModel;
  okey: string;
  date: string;           // booking date formatted as dd.mm.yyyy
  year: number;           // booking year (from the yyyymmdd StoreDate)
  creditAccount: string;  // account id(s) of the credit line(s), comma-joined
  debitAccount: string;   // account id(s) of the debit line(s), comma-joined
  creditAccountName: string;  // account name(s) of the credit line(s), comma-joined ('' when unknown)
  debitAccountName: string;
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
  accountNameByKey: Map<string, string> = new Map(),
): JournalRow {
  const creditIds = new Set<string>();
  const debitIds = new Set<string>();
  const creditNames = new Set<string>();
  const debitNames = new Set<string>();
  let total = 0;
  let currency = 'CHF';
  for (const line of lines) {
    const id = accountIdByKey.get(line.accountKey) ?? '';
    const name = accountNameByKey.get(line.accountKey) ?? '';
    if (line.creditAmount) {
      if (id) creditIds.add(id);
      if (name) creditNames.add(name);
      total += line.creditAmount.amount;
      currency = line.creditAmount.currency;
    }
    if (line.debitAmount) {
      if (id) debitIds.add(id);
      if (name) debitNames.add(name);
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
    creditAccountName: [...creditNames].join(', '),
    debitAccountName: [...debitNames].join(', '),
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

/*-------------------------- edit form: pairs <-> lines --------------------------------*/

/**
 * One row of the booking form: a debit account against a credit account for one amount — the way
 * a treasurer thinks of a booking (Soll / Haben / Betrag). Amounts are minor units. `amountFx` and
 * `vatCodeKey` sit behind the row's detail toggle; `amountFx = 0` means none.
 */
export interface BookingPair {
  debitAccountKey: string;
  creditAccountKey: string;
  amount: number;
  amountFx: number;
  fxCurrency: string;
  vatCodeKey: string;
  vatSide: 'debit' | 'credit';   // which line carries the VAT code (expense → debit, revenue → credit)
}

export interface BookingFormData {
  okey: string;
  title: string;
  date: string;              // StoreDate yyyymmdd
  notes: string;
  counterparty: AvatarInfo | undefined;
  pairs: BookingPair[];
}

export function emptyBookingPair(): BookingPair {
  return { debitAccountKey: '', creditAccountKey: '', amount: 0, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' };
}

/**
 * Split the stored lines into debit/credit pairs (greedy: the smaller open amount of the two heads
 * closes a pair). A two-line booking is exactly one pair; a split booking (one debit, several
 * credits) is one pair per credit. An unbalanced booking leaves a pair with one empty account,
 * which the form flags. FX and VAT are carried onto the pair when both lines agree or only one
 * side has them.
 */
export function linesToPairs(lines: BookingLineModel[]): BookingPair[] {
  type Open = { accountKey: string; left: number; amountFx: number; fxCurrency: string; vatCodeKey: string; total: number };
  const open = (l: BookingLineModel, m: MoneyModel): Open => ({
    accountKey: l.accountKey, left: m.amount, total: m.amount,
    amountFx: l.amountFx?.amount ?? 0, fxCurrency: l.amountFx?.currency ?? 'EUR', vatCodeKey: l.vatCodeKey ?? '',
  });
  const debits = lines.filter(l => l.debitAmount && l.debitAmount.amount > 0).map(l => open(l, l.debitAmount as MoneyModel));
  const credits = lines.filter(l => l.creditAmount && l.creditAmount.amount > 0).map(l => open(l, l.creditAmount as MoneyModel));
  const pairs: BookingPair[] = [];
  while (debits.length && credits.length) {
    const d = debits[0], c = credits[0];
    const amount = Math.min(d.left, c.left);
    // fx only when the pair takes a line whole (otherwise the fx split is unknown)
    const fxSource = d.left === d.total && amount === d.total && d.amountFx ? d : (c.left === c.total && amount === c.total && c.amountFx ? c : undefined);
    pairs.push({ debitAccountKey: d.accountKey, creditAccountKey: c.accountKey, amount,
      amountFx: fxSource?.amountFx ?? 0, fxCurrency: fxSource?.fxCurrency ?? 'EUR',
      vatCodeKey: d.vatCodeKey || c.vatCodeKey, vatSide: d.vatCodeKey || !c.vatCodeKey ? 'debit' : 'credit' });
    d.left -= amount; c.left -= amount;
    if (d.left === 0) debits.shift();
    if (c.left === 0) credits.shift();
  }
  for (const d of debits) pairs.push({ debitAccountKey: d.accountKey, creditAccountKey: '', amount: d.left, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: d.vatCodeKey, vatSide: 'debit' });
  for (const c of credits) pairs.push({ debitAccountKey: '', creditAccountKey: c.accountKey, amount: c.left, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: c.vatCodeKey, vatSide: 'credit' });
  return pairs;
}

/**
 * Turn the form's pairs back into lines, one per (account, side): amounts of the same account on
 * the same side are merged, so a booking round-trips to its compact line set. Debit lines first.
 */
export function pairsToLines(pairs: BookingPair[], tenantId: string, accountingTenantId: string, bookingKey: string, currency = 'CHF'): BookingLineModel[] {
  type Acc = { amount: number; amountFx: number; fxCurrency: string; vatCodeKey: string };
  const merge = (map: Map<string, Acc>, key: string, p: BookingPair, vatCodeKey: string): void => {
    if (!key) return;
    const acc = map.get(key) ?? { amount: 0, amountFx: 0, fxCurrency: p.fxCurrency, vatCodeKey: '' };
    acc.amount += p.amount;
    acc.amountFx += p.amountFx;
    if (!acc.vatCodeKey && vatCodeKey) acc.vatCodeKey = vatCodeKey;
    map.set(key, acc);
  };
  const debits = new Map<string, Acc>(), credits = new Map<string, Acc>();
  for (const p of pairs) {
    merge(debits, p.debitAccountKey, p, p.vatSide === 'credit' ? '' : p.vatCodeKey);
    merge(credits, p.creditAccountKey, p, p.vatSide === 'credit' ? p.vatCodeKey : '');
  }
  const toLine = (accountKey: string, acc: Acc, side: 'debit' | 'credit'): BookingLineModel => {
    const line = new BookingLineModel(tenantId, accountingTenantId);
    line.bookingKey = bookingKey;
    line.accountKey = accountKey;
    const money = new MoneyModel(acc.amount, currency as MoneyModel['currency']);
    if (side === 'debit') line.debitAmount = money; else line.creditAmount = money;
    line.amountFx = acc.amountFx > 0 ? new MoneyModel(acc.amountFx, acc.fxCurrency as MoneyModel['currency']) : undefined;
    line.vatCodeKey = acc.vatCodeKey;
    return line;
  };
  return [
    ...[...debits.entries()].map(([k, a]) => toLine(k, a, 'debit')),
    ...[...credits.entries()].map(([k, a]) => toLine(k, a, 'credit')),
  ];
}

export function toBookingFormData(booking: BookingModel, lines: BookingLineModel[]): BookingFormData {
  const pairs = linesToPairs(lines);
  return { okey: booking.okey, title: booking.title, date: booking.date, notes: booking.notes ?? '', counterparty: booking.counterparty,
    pairs: pairs.length ? pairs : [emptyBookingPair()] };
}

/** Σ pair amounts in minor units — the booking total shown while editing. */
export function pairsTotal(pairs: BookingPair[]): number {
  return pairs.reduce((sum, p) => sum + (p.amount || 0), 0);
}

/**
 * "Buchung kopieren": a fresh, unsaved booking with the same text, counterparty and lines, dated
 * today. Everything that belongs to the original stays behind — its key and booking number, the
 * voucher (`documentKey`) and period, the review status, and — because they hang on the original's
 * key — its Belege and comments. The copy starts as a `draft`; the `writeBooking` CF assigns the
 * booking number when it is saved.
 */
export function copyBooking(
  booking: BookingModel,
  lines: BookingLineModel[],
  date: string,
): { booking: BookingModel; lines: BookingLineModel[] } {
  const tenantId = booking.tenants[0] ?? '';
  const copy = new BookingModel(tenantId, booking.accountingTenantId);
  copy.title = booking.title;
  copy.date = date;
  copy.notes = booking.notes ?? '';
  copy.tags = booking.tags ?? '';
  copy.counterparty = booking.counterparty;
  return {
    booking: copy,
    lines: lines.map(line => {
      const copiedLine = new BookingLineModel(tenantId, booking.accountingTenantId);
      copiedLine.accountKey = line.accountKey;
      copiedLine.debitAmount = line.debitAmount;
      copiedLine.creditAmount = line.creditAmount;
      copiedLine.amountFx = line.amountFx;
      copiedLine.exchangeRateKey = line.exchangeRateKey;
      copiedLine.vatCodeKey = line.vatCodeKey;
      return copiedLine;
    }),
  };
}
