import { BookingLineModel, BookingModel, LedgerBalanceModel } from '@okr/shared-models';

import { accountSaldo, buildLedgerYears, countBookings, ledgerComputedAt, ledgerFiscalYears, linesFromCells, ledgerMonthOf, openingOf, sumCellsByAccount } from './ledger-balance.util';
import { DebitCredit, fiscalYear, sumLinesByAccount } from './report.util';

const STATUSES = ['posted', 'posted', 'posted', 'draft', 'cancelled', 'forReview'] as const;
const ACCOUNTS = ['a1020', 'a1100', 'a2000', 'a3000', 'a4000', 'a6000'];
const CENTERS = ['', 'cc1', 'cc2'];
const PROJECTS = ['', '', 'p1'];

/** A deterministic ledger across 2023–2026 plus undated bookings, every status. */
function ledger(): { bookings: BookingModel[]; lines: BookingLineModel[] } {
  let seed = 7;
  const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const bookings: BookingModel[] = [];
  const lines: BookingLineModel[] = [];
  for (let i = 0; i < 400; i++) {
    const year = 2023 + rnd(4);
    const month = 1 + rnd(12);
    const day = 1 + rnd(28);
    const date = i % 50 === 0 ? '' : `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
    const okey = `b${i}`;
    bookings.push({ okey, date, status: STATUSES[rnd(STATUSES.length)] } as BookingModel);
    const amount = 100 + rnd(100000);
    const debit = ACCOUNTS[rnd(ACCOUNTS.length)];
    const credit = ACCOUNTS[rnd(ACCOUNTS.length)];
    const c = CENTERS[rnd(CENTERS.length)];
    const p = PROJECTS[rnd(PROJECTS.length)];
    lines.push({ bookingKey: okey, accountKey: debit, debitAmount: { amount, currency: 'CHF' }, costCenterKey: c, projectKey: p } as BookingLineModel);
    lines.push({ bookingKey: okey, accountKey: credit, creditAmount: { amount, currency: 'CHF' }, costCenterKey: c, projectKey: p } as BookingLineModel);
  }
  // a line without account and a line of an unknown booking: both ignored by the sums
  lines.push({ bookingKey: 'b1', accountKey: '', debitAmount: { amount: 5, currency: 'CHF' } } as BookingLineModel);
  lines.push({ bookingKey: 'unknown', accountKey: 'a1020', debitAmount: { amount: 5, currency: 'CHF' } } as BookingLineModel);
  return { bookings, lines };
}

function docsOf(bookings: BookingModel[], lines: BookingLineModel[]): LedgerBalanceModel[] {
  return [...buildLedgerYears(bookings, lines).values()].map(y => ({ ...new LedgerBalanceModel(['t'], 'books', y.year), ...y }));
}

function plain(map: Map<string, DebitCredit>): Record<string, DebitCredit> {
  return Object.fromEntries([...map.entries()].filter(([, v]) => v.debit || v.credit).sort(([x], [y]) => x.localeCompare(y)));
}

describe('ledger balances', () => {
  const { bookings, lines } = ledger();
  const docs = docsOf(bookings, lines);

  it('reads the calendar month of a StoreDate, 0 for a missing one', () => {
    expect(ledgerMonthOf('20260315')).toEqual({ year: 2026, month: 3 });
    expect(ledgerMonthOf('')).toEqual({ year: 0, month: 0 });
    expect(ledgerMonthOf(undefined)).toEqual({ year: 0, month: 0 });
    expect(ledgerMonthOf('2026')).toEqual({ year: 0, month: 0 });
  });

  it.each([1, 7])('equals sumLinesByAccount for every fiscal year (start month %i), Bilanz and ER', start => {
    for (const year of [2022, 2023, 2024, 2025, 2026]) {
      const fy = fiscalYear(year, start);
      expect(plain(sumCellsByAccount(docs, fy.from, fy.to))).toEqual(plain(sumLinesByAccount(lines, bookings, fy.from, fy.to)));
      expect(plain(sumCellsByAccount(docs, '', fy.to))).toEqual(plain(sumLinesByAccount(lines, bookings, '', fy.to)));
    }
  });

  it('equals sumLinesByAccount over the whole ledger and for single months', () => {
    expect(plain(sumCellsByAccount(docs, '', ''))).toEqual(plain(sumLinesByAccount(lines, bookings, '', '')));
    expect(plain(sumCellsByAccount(docs, '20250201', '20250228'))).toEqual(plain(sumLinesByAccount(lines, bookings, '20250201', '20250228')));
    expect(plain(sumCellsByAccount(docs, '20240201', '20240229'))).toEqual(plain(sumLinesByAccount(lines, bookings, '20240201', '20240229')));
  });

  it('filters by Kostenstelle like filtering the lines first', () => {
    const fy = fiscalYear(2025, 1);
    const filtered = lines.filter(l => l.costCenterKey === 'cc1');
    expect(plain(sumCellsByAccount(docs, fy.from, fy.to, c => c.c === 'cc1'))).toEqual(plain(sumLinesByAccount(filtered, bookings, fy.from, fy.to)));
  });

  it('refuses a range that cuts a month', () => {
    expect(() => sumCellsByAccount(docs, '20250115', '20251231')).toThrow();
    expect(() => sumCellsByAccount(docs, '20250101', '20251230')).toThrow();
    expect(() => countBookings(docs, '20250102', '')).toThrow();
    expect(() => openingOf(docs, ['a1020'], '20250131')).toThrow();
  });

  it('gives the opening balance before a month', () => {
    const before = '20250701';
    const expected = sumLinesByAccount(lines.filter(l => l.accountKey === 'a1020'), bookings, '', '20250630');
    expect(plain(openingOf(docs, ['a1020'], before))).toEqual(plain(expected));
  });

  it('counts the bookings of every status per period', () => {
    const inRange = (from: string, to: string): number => bookings.filter(b => b.date && b.date >= from && b.date <= to).length;
    expect(countBookings(docs, '20250101', '20251231')).toBe(inRange('20250101', '20251231'));
    expect(countBookings(docs, '20250701', '20260630')).toBe(inRange('20250701', '20260630'));
    expect(countBookings(docs, '', '')).toBe(bookings.length);
  });

  it('counts all bookings and their lines per year, for the integrity check', () => {
    const years = buildLedgerYears(bookings, lines);
    const totalBookings = [...years.values()].reduce((s, y) => s + y.bookingCount, 0);
    const totalLines = [...years.values()].reduce((s, y) => s + y.lineCount, 0);
    expect(totalBookings).toBe(bookings.length);
    expect(totalLines).toBe(lines.length - 1);   // the line of the unknown booking belongs to no year
  });

  it('builds the same document from the same ledger, in any order', () => {
    const a = buildLedgerYears(bookings, lines).get(2025);
    const b = buildLedgerYears([...bookings].reverse(), [...lines].reverse()).get(2025);
    expect(b).toEqual(a);
  });

  it('gives the cells as lines with the same sums', () => {
    const fy = fiscalYear(2025, 7);
    const asLines = linesFromCells(docs, fy.from, fy.to);
    const posted = new Set(bookings.filter(b => b.status === 'posted' && b.date >= fy.from && b.date <= fy.to).map(b => b.okey));
    const sum = (ls: BookingLineModel[]): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const l of ls) {
        if (!l.accountKey) continue;
        const k = `${l.accountKey}|${l.costCenterKey ?? ''}`;
        out[k] = (out[k] ?? 0) + (l.debitAmount?.amount ?? 0) - (l.creditAmount?.amount ?? 0);
      }
      return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0).sort());
    };
    expect(sum(asLines)).toEqual(sum(lines.filter(l => posted.has(l.bookingKey))));
  });

  it('lists the fiscal years with bookings', () => {
    const years = ledgerFiscalYears([{ year: 2025, bookingCounts: [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0] }, { year: 0, bookingCounts: [] }], 7);
    expect(years).toEqual([2025, 2024]);
    expect(ledgerFiscalYears([{ year: 2025, bookingCounts: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }], 1)).toEqual([2025]);
  });

  it('gives the signed saldo of one account over whole months', () => {
    const sum = (accountKey: string, from: string, before: string): number => {
      const posted = new Map(bookings.filter(b => b.status === 'posted' && b.date && b.date >= from && b.date < before).map(b => [b.okey, b]));
      return lines.filter(l => l.accountKey === accountKey && posted.has(l.bookingKey))
        .reduce((s, l) => s + (l.debitAmount?.amount ?? 0) - (l.creditAmount?.amount ?? 0), 0);
    };
    // undated bookings count from the beginning, as in openingOf
    const undated = (accountKey: string): number => {
      const keys = new Set(bookings.filter(b => b.status === 'posted' && !b.date).map(b => b.okey));
      return lines.filter(l => l.accountKey === accountKey && keys.has(l.bookingKey)).reduce((s, l) => s + (l.debitAmount?.amount ?? 0) - (l.creditAmount?.amount ?? 0), 0);
    };
    expect(accountSaldo(docs, 'a1020', '1020', '', '20250701')).toBe(sum('a1020', '', '20250701') + undated('a1020'));
    expect(accountSaldo(docs, 'a6000', '6000', '20250101', '20250701')).toBe(sum('a6000', '20250101', '20250701'));
    expect(sum('a3000', '20230101', '20260101')).not.toBe(0);
    expect(accountSaldo(docs, 'a3000', '3000', '20230101', '20260101')).toBe(0 - sum('a3000', '20230101', '20260101'));
  });

  it('shows the newest computedAt', () => {
    expect(ledgerComputedAt([{ computedAt: '20251231120000' }, { computedAt: '20261126101500' }])).toBe('20261126101500');
    expect(ledgerComputedAt([])).toBe('');
  });
});
