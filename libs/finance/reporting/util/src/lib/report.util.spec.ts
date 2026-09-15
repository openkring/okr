import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BookingModel, MoneyModel } from '@okr/shared-models';

import {
  accountClass, buildReportRows, defaultExpandedKeys, fiscalYear, fiscalYearOf, reportToCsv, signedBalance, sumLinesByAccount, totalForClasses, yearResult,
} from './report.util';

function account(okey: string, id: string, name: string, parentKey = '', type = 'leaf'): AccountModel {
  return { ...new AccountModel('t1'), okey, id, name, parentKey, type, accountingTenantId: 'acc' };
}
function booking(okey: string, date: string, status = 'posted'): BookingModel {
  return { okey, date, status } as unknown as BookingModel;
}
function line(bookingKey: string, accountKey: string, debit: number, credit: number): BookingLineModel {
  return {
    ...new BookingLineModel('t1', 'acc'), bookingKey, accountKey,
    debitAmount: debit ? new MoneyModel(debit, 'CHF') : undefined,
    creditAmount: credit ? new MoneyModel(credit, 'CHF') : undefined,
  };
}

// a minimal Swiss chart: root → Aktiven(1) → Flüssige Mittel(100) → Kasse(1000), Bank(1020);
// Passiven(2) → Eigenkapital(28) → Kapital(2800); Ertrag(3) → Beiträge(3000); Aufwand(6) → Miete(6000)
const CHART: AccountModel[] = [
  account('root', '', 'Kontoplan', '', 'root'),
  account('a1', '1', 'Aktiven', 'root', 'group'),
  account('a100', '100', 'Flüssige Mittel', 'a1', 'group'),
  account('a1000', '1000', 'Kasse', 'a100'),
  account('a1020', '1020', 'Bank', 'a100'),
  account('a2', '2', 'Passiven', 'root', 'group'),
  account('a28', '28', 'Eigenkapital', 'a2', 'group'),
  account('a2800', '2800', 'Kapital', 'a28'),
  account('a3', '3', 'Ertrag', 'root', 'group'),
  account('a3000', '3000', 'Beiträge', 'a3'),
  account('a6', '6', 'Aufwand', 'root', 'group'),
  account('a6000', '6000', 'Miete', 'a6'),
];

describe('accountClass', () => {
  it('classifies by the first digit of the account number', () => {
    expect(accountClass('1020')).toBe('assets');
    expect(accountClass('2800')).toBe('liabilities');
    expect(accountClass('3000')).toBe('revenue');
    expect(accountClass('4000')).toBe('expense');
    expect(accountClass('5000')).toBe('expense');
    expect(accountClass('6900')).toBe('expense');
    expect(accountClass('7000')).toBe('result');
    expect(accountClass('8500')).toBe('result');
    expect(accountClass('9100')).toBe('result');
    expect(accountClass('')).toBe('other');
    expect(accountClass('CH12 0077')).toBe('other');
  });
});

describe('fiscalYear', () => {
  it('is the calendar year when the fiscal year starts in January', () => {
    expect(fiscalYear(2025, 1)).toEqual({ year: 2025, from: '20250101', to: '20251231', label: '2025' });
  });
  it('spans two calendar years otherwise and is labelled by both', () => {
    expect(fiscalYear(2025, 7)).toEqual({ year: 2025, from: '20250701', to: '20260630', label: '2025/26' });
    expect(fiscalYear(2025, 2)).toEqual({ year: 2025, from: '20250201', to: '20260131', label: '2025/26' });
  });
  it('assigns a date to its fiscal year', () => {
    expect(fiscalYearOf('20250315', 1)).toBe(2025);
    expect(fiscalYearOf('20250315', 7)).toBe(2024);
    expect(fiscalYearOf('20250701', 7)).toBe(2025);
    expect(fiscalYearOf('', 1)).toBe(0);
  });
});

describe('sumLinesByAccount', () => {
  const bookings = [booking('b1', '20250110'), booking('b2', '20250620'), booking('b3', '20251231'), booking('b4', '20260105'), booking('b5', '20250301', 'draft')];
  const lines = [
    line('b1', 'a1020', 50000, 0), line('b1', 'a3000', 0, 50000),      // Beitrag 500.00
    line('b2', 'a6000', 12000, 0), line('b2', 'a1020', 0, 12000),      // Miete 120.00
    line('b3', 'a1000', 1000, 0), line('b3', 'a1020', 0, 1000),        // Bezug 10.00
    line('b4', 'a6000', 12000, 0), line('b4', 'a1020', 0, 12000),      // Miete next year
    line('b5', 'a6000', 99999, 0), line('b5', 'a1020', 0, 99999),      // draft: ignored
    line('orphan', 'a6000', 77777, 0),                                 // booking missing: ignored
  ];

  it('sums debit and credit per account for posted bookings inside the range', () => {
    const m = sumLinesByAccount(lines, bookings, '20250101', '20251231');
    expect(m.get('a1020')).toEqual({ debit: 50000, credit: 13000 });
    expect(m.get('a6000')).toEqual({ debit: 12000, credit: 0 });
    expect(m.get('a1000')).toEqual({ debit: 1000, credit: 0 });
    expect(m.get('a3000')).toEqual({ debit: 0, credit: 50000 });
  });

  it('a range up to a date is cumulative (balance sheet), a range within a year is not', () => {
    expect(sumLinesByAccount(lines, bookings, '', '20261231').get('a6000')).toEqual({ debit: 24000, credit: 0 });
    expect(sumLinesByAccount(lines, bookings, '20260101', '20261231').get('a6000')).toEqual({ debit: 12000, credit: 0 });
  });
});

describe('signedBalance', () => {
  it('shows assets and expenses debit-positive, everything else credit-positive', () => {
    expect(signedBalance('assets', { debit: 500, credit: 200 })).toBe(300);
    expect(signedBalance('expense', { debit: 500, credit: 200 })).toBe(300);
    expect(signedBalance('liabilities', { debit: 200, credit: 500 })).toBe(300);
    expect(signedBalance('revenue', { debit: 200, credit: 500 })).toBe(300);
    expect(signedBalance('result', { debit: 200, credit: 500 })).toBe(300);
  });
});

describe('buildReportRows', () => {
  const current = new Map([['a1020', { debit: 50000, credit: 13000 }], ['a1000', { debit: 1000, credit: 0 }], ['a3000', { debit: 0, credit: 50000 }], ['a6000', { debit: 12000, credit: 0 }]]);
  const previous = new Map([['a1020', { debit: 10000, credit: 0 }], ['a3000', { debit: 0, credit: 10000 }]]);

  it('renders the requested classes as an indented tree with group subtotals', () => {
    const rows = buildReportRows(CHART, ['assets', 'liabilities'], current, previous, ['a1', 'a100', 'a2', 'a28'], true);
    expect(rows.map(r => [r.id, r.depth, r.kind, r.current, r.previous])).toEqual([
      ['1', 0, 'group', 38000, 10000],
      ['100', 1, 'group', 38000, 10000],
      ['1000', 2, 'account', 1000, 0],
      ['1020', 2, 'account', 37000, 10000],
      ['2', 0, 'group', 0, 0],
      ['28', 1, 'group', 0, 0],
      ['2800', 2, 'account', 0, 0],
    ]);
  });

  it('hides rows that are zero in both years unless asked to show them', () => {
    const rows = buildReportRows(CHART, ['assets', 'liabilities'], current, previous, ['a1', 'a100', 'a2', 'a28'], false);
    expect(rows.map(r => r.id)).toEqual(['1', '100', '1000', '1020']);
  });

  it('collapses a group that is not expanded but keeps its subtotal', () => {
    const rows = buildReportRows(CHART, ['assets'], current, previous, ['a1'], true);
    expect(rows.map(r => [r.id, r.hasChildren, r.isExpanded])).toEqual([['1', true, true], ['100', true, false]]);
    expect(rows[1].current).toBe(38000);
  });

  it('orders siblings by account number', () => {
    const shuffled = [...CHART].reverse();
    const rows = buildReportRows(shuffled, ['assets'], current, previous, ['a1', 'a100'], true);
    expect(rows.map(r => r.id)).toEqual(['1', '100', '1000', '1020']);
  });

  it('ignores archived accounts and charts', () => {
    const withArchived = [...CHART, { ...account('old', '1', 'Alt', 'root', 'group'), isArchived: true }];
    const rows = buildReportRows(withArchived, ['assets'], current, previous, [], true);
    expect(rows.map(r => r.okey)).toEqual(['a1']);
  });

  it('totals and year result', () => {
    expect(totalForClasses(CHART, ['assets'], current)).toBe(38000);
    expect(totalForClasses(CHART, ['liabilities'], current)).toBe(0);
    expect(totalForClasses(CHART, ['expense'], current)).toBe(12000);
    expect(yearResult(CHART, current)).toBe(38000);   // 500.00 revenue − 120.00 expense
    expect(yearResult(CHART, previous)).toBe(10000);
  });
});

describe('defaultExpandedKeys', () => {
  it('opens the class groups and their direct children, never leaves', () => {
    expect(defaultExpandedKeys(CHART)).toEqual(['a1', 'a100', 'a2', 'a28', 'a3', 'a6']);
    expect(defaultExpandedKeys(CHART, 1)).toEqual(['a1', 'a2', 'a3', 'a6']);
  });
});

describe('reportToCsv', () => {
  it('writes one line per row with amounts in francs and a semicolon separator', () => {
    const rows = buildReportRows(CHART, ['expense'], new Map([['a6000', { debit: 12050, credit: 0 }]]), new Map(), ['a6'], true);
    const csv = reportToCsv(rows, ['Konto', 'Bezeichnung', '2025', '2024']);
    expect(csv.split('\n')).toEqual([
      'Konto;Bezeichnung;2025;2024',
      '6;Aufwand;120.50;0.00',
      '6000;Miete;120.50;0.00',
    ]);
  });

  it('escapes a name containing the separator or quotes', () => {
    const rows = buildReportRows([account('x', '6000', 'Miete; "Büro"', '')], ['expense'], new Map(), new Map(), [], true);
    expect(reportToCsv(rows, ['a', 'b', 'c', 'd']).split('\n')[1]).toBe('6000;"Miete; ""Büro""";0.00;0.00');
  });
});
