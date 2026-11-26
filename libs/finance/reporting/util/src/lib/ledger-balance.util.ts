import { BookingLineModel, BookingModel, LedgerBalanceCell, LedgerBalanceModel } from '@okr/shared-models';

import { accountClass, DebitCredit, signedBalance } from './report.util';

/**
 * Ledger balances (spec 1.177): the posted lines summed per calendar month × account × Kostenstelle × project,
 * one document per books and calendar year. Built by the Cloud Function from the ledger (`buildLedgerYears`) and
 * read by the reports (`sumCellsByAccount`, `openingOf`, `countBookings`). The sums equal `sumLinesByAccount` over
 * the same bookings for every range made of whole months.
 */

/** What one year's document holds besides its identity. */
export interface LedgerYear {
  year: number;
  cells: LedgerBalanceCell[];
  bookingCounts: number[];
  bookingCount: number;
  lineCount: number;
}

/** The part of a booking the balances need. */
export type LedgerBooking = Pick<BookingModel, 'okey' | 'date' | 'status'>;
/** The part of a line the balances need. */
export type LedgerLine = Pick<BookingLineModel, 'bookingKey' | 'accountKey' | 'debitAmount' | 'creditAmount' | 'costCenterKey' | 'projectKey'>;

const STORE_DATE = /^\d{8}$/;

/** Calendar year and month of a StoreDate; year 0 / month 0 for a missing or malformed date (the undated document). */
export function ledgerMonthOf(date: string | undefined): { year: number; month: number } {
  if (!date || !STORE_DATE.test(date)) return { year: 0, month: 0 };
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  if (!year || month < 1 || month > 12) return { year: 0, month: 0 };
  return { year, month };
}

function emptyYear(year: number): LedgerYear {
  return { year, cells: [], bookingCounts: new Array(12).fill(0), bookingCount: 0, lineCount: 0 };
}

/**
 * The year documents of a ledger. Counts cover every booking and every line whose booking is given (any status);
 * cells only posted bookings, exactly as `sumLinesByAccount`. Lines of a booking not in `bookings` are ignored.
 * Cells are sorted (month, account, Kostenstelle, project), so the same ledger always gives the same document.
 */
export function buildLedgerYears(bookings: LedgerBooking[], lines: LedgerLine[]): Map<number, LedgerYear> {
  const years = new Map<number, LedgerYear>();
  const byKey = new Map<string, { year: number; month: number; posted: boolean }>();
  const yearOf = (year: number): LedgerYear => {
    let y = years.get(year);
    if (!y) { y = emptyYear(year); years.set(year, y); }
    return y;
  };
  for (const b of bookings) {
    const { year, month } = ledgerMonthOf(b.date);
    byKey.set(b.okey, { year, month, posted: b.status === 'posted' });
    const y = yearOf(year);
    y.bookingCount++;
    if (month > 0) y.bookingCounts[month - 1]++;
  }
  const cellMaps = new Map<number, Map<string, LedgerBalanceCell>>();
  for (const line of lines) {
    const b = byKey.get(line.bookingKey);
    if (!b) continue;
    const y = yearOf(b.year);
    y.lineCount++;
    if (!b.posted) continue;
    const a = line.accountKey ?? '';
    if (!a) continue;
    const c = line.costCenterKey ?? '';
    const p = line.projectKey ?? '';
    let cells = cellMaps.get(b.year);
    if (!cells) { cells = new Map(); cellMaps.set(b.year, cells); }
    const id = `${b.month}\u0000${a}\u0000${c}\u0000${p}`;
    let cell = cells.get(id);
    if (!cell) { cell = { m: b.month, a, c, p, d: 0, k: 0 }; cells.set(id, cell); }
    cell.d += line.debitAmount?.amount ?? 0;
    cell.k += line.creditAmount?.amount ?? 0;
  }
  for (const [year, cells] of cellMaps) {
    yearOf(year).cells = [...cells.values()].sort(compareCells);
  }
  return years;
}

function compareCells(x: LedgerBalanceCell, y: LedgerBalanceCell): number {
  return x.m - y.m || cmp(x.a, y.a) || cmp(x.c, y.c) || cmp(x.p, y.p);
}
function cmp(x: string, y: string): number { return x < y ? -1 : x > y ? 1 : 0; }

/** Month bounds of a range; throws on a date inside a month, so nobody gets a silently rounded period. */
function monthRange(from: string, to: string): { lo: number; hi: number } {
  let lo = -Infinity;
  let hi = Infinity;
  if (from) {
    if (!STORE_DATE.test(from) || !from.endsWith('01')) throw new Error(`ledger balances: from must start a month: ${from}`);
    lo = Number(from.slice(0, 6));
  }
  if (to) {
    if (!STORE_DATE.test(to) || !isLastDayOfMonth(to)) throw new Error(`ledger balances: to must end a month: ${to}`);
    hi = Number(to.slice(0, 6));
  }
  return { lo, hi };
}

function isLastDayOfMonth(date: string): boolean {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  return day === new Date(year, month, 0).getDate();
}

/** Whether a document's month (year 0 = undated) lies in the range. Undated counts only from the beginning. */
function inRange(year: number, month: number, lo: number, hi: number): boolean {
  if (year === 0) return lo === -Infinity;
  const ym = year * 100 + month;
  return ym >= lo && ym <= hi;
}

/**
 * Debit/credit per account okey over [from, to] (whole months; `from` '' = since the beginning, `to` '' = open end),
 * optionally only the cells `filter` accepts (Kostenstelle, project, account). Same result as `sumLinesByAccount`.
 */
export function sumCellsByAccount(
  docs: Pick<LedgerBalanceModel, 'year' | 'cells'>[], from: string, to: string, filter?: (cell: LedgerBalanceCell) => boolean,
): Map<string, DebitCredit> {
  const { lo, hi } = monthRange(from, to);
  const out = new Map<string, DebitCredit>();
  for (const doc of docs) {
    for (const cell of doc.cells ?? []) {
      if (!inRange(doc.year, cell.m, lo, hi)) continue;
      if (filter && !filter(cell)) continue;
      const entry = out.get(cell.a) ?? { debit: 0, credit: 0 };
      entry.debit += cell.d;
      entry.credit += cell.k;
      out.set(cell.a, entry);
    }
  }
  return out;
}

/**
 * The cells in [from, to] (whole months) as line-shaped rows — one per cell, `bookingKey` '' — for code that aggregates
 * lines by account, Kostenstelle or project (`aggregateByCostCenter`, `filterLinesByCostCenter`). Debit and credit
 * stay apart, so the sums are those of the lines themselves.
 */
export function linesFromCells(docs: Pick<LedgerBalanceModel, 'year' | 'cells'>[], from: string, to: string, currency = 'CHF'): BookingLineModel[] {
  const { lo, hi } = monthRange(from, to);
  const out: BookingLineModel[] = [];
  for (const doc of docs) {
    for (const cell of doc.cells ?? []) {
      if (!inRange(doc.year, cell.m, lo, hi)) continue;
      out.push({
        bookingKey: '', accountKey: cell.a, costCenterKey: cell.c, projectKey: cell.p,
        debitAmount: cell.d ? { amount: cell.d, currency } : undefined,
        creditAmount: cell.k ? { amount: cell.k, currency } : undefined,
      } as BookingLineModel);
    }
  }
  return out;
}

/** Fiscal years (start month `startMonth`) that have at least one booking in the documents, newest first. */
export function ledgerFiscalYears(docs: Pick<LedgerBalanceModel, 'year' | 'bookingCounts'>[], startMonth: number): number[] {
  const start = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  const years = new Set<number>();
  for (const doc of docs) {
    if (!doc.year) continue;
    (doc.bookingCounts ?? []).forEach((n, i) => { if (n > 0) years.add(i + 1 >= start ? doc.year : doc.year - 1); });
  }
  return [...years].sort((a, b) => b - a);
}

/** Balances of `accountKeys` before `before` (the first day of a month): the opening of a period. */
export function openingOf(docs: Pick<LedgerBalanceModel, 'year' | 'cells'>[], accountKeys: Iterable<string>, before: string): Map<string, DebitCredit> {
  if (!STORE_DATE.test(before) || !before.endsWith('01')) throw new Error(`ledger balances: before must start a month: ${before}`);
  const keys = new Set(accountKeys);
  const lo = Number(before.slice(0, 6));
  const out = new Map<string, DebitCredit>();
  for (const doc of docs) {
    for (const cell of doc.cells ?? []) {
      if (!keys.has(cell.a)) continue;
      if (doc.year !== 0 && doc.year * 100 + cell.m >= lo) continue;
      const entry = out.get(cell.a) ?? { debit: 0, credit: 0 };
      entry.debit += cell.d;
      entry.credit += cell.k;
      out.set(cell.a, entry);
    }
  }
  return out;
}

/**
 * Signed saldo of one account over [from, before) — `from` '' = since the beginning; both are the first day of a month
 * (or ''). The opening balance of a running saldo or of the cash in a cash-flow statement. Same as `openingBalance`
 * (booking util) over posted bookings.
 */
export function accountSaldo(docs: Pick<LedgerBalanceModel, 'year' | 'cells'>[], accountKey: string, accountId: string, from: string, before: string): number {
  const cls = accountClass(accountId);
  const upTo = openingOf(docs, [accountKey], before).get(accountKey);
  const pre = from ? openingOf(docs, [accountKey], from).get(accountKey) : undefined;
  const dc = { debit: (upTo?.debit ?? 0) - (pre?.debit ?? 0), credit: (upTo?.credit ?? 0) - (pre?.credit ?? 0) };
  return signedBalance(cls, dc);
}

/** Bookings of every status dated in [from, to] (whole months). Undated ones count only from the beginning. */
export function countBookings(docs: Pick<LedgerBalanceModel, 'year' | 'bookingCounts' | 'bookingCount'>[], from: string, to: string): number {
  const { lo, hi } = monthRange(from, to);
  let n = 0;
  for (const doc of docs) {
    if (doc.year === 0) {
      if (lo === -Infinity) n += doc.bookingCount ?? 0;
      continue;
    }
    (doc.bookingCounts ?? []).forEach((count, i) => { if (inRange(doc.year, i + 1, lo, hi)) n += count; });
  }
  return n;
}

/** The newest `computedAt` of the documents ('' for none): the «Stand» a report shows. */
export function ledgerComputedAt(docs: Pick<LedgerBalanceModel, 'computedAt'>[]): string {
  return docs.reduce((max, d) => (d.computedAt ?? '') > max ? d.computedAt : max, '');
}
