import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BudgetLineModel, BudgetVersionModel, CostCenterModel, MoneyModel } from '@okr/shared-models';
import { aggregateByCostCenter, rollUpCostCenters } from '@okr/finance-cost-center-util';

import { buildComparisonRows, ComparisonRow, defaultCompareVersion, usedPercent } from './budget-compare.util';

const cc = (okey: string, id: string, parentKey: string, type: 'root' | 'group' | 'leaf'): CostCenterModel =>
  ({ ...new CostCenterModel('scs', 'scs'), okey, id, name: okey, parentKey, type });
const acct = (okey: string, id: string): AccountModel => ({ ...new AccountModel('scs'), okey, id, name: `A${id}` });
const bl = (okey: string, costCenterKey: string, accountKey: string, amount: number): BudgetLineModel =>
  ({ ...new BudgetLineModel('scs', 'scs', 'v1'), okey, costCenterKey, accountKey, amount: new MoneyModel(amount, 'CHF') });
const booking = (okey: string, costCenterKey: string | undefined, accountKey: string, debit: number): BookingLineModel =>
  ({ ...new BookingLineModel('scs', 'scs'), okey, bookingKey: 'b1', costCenterKey, accountKey, debitAmount: new MoneyModel(debit, 'CHF'), creditAmount: new MoneyModel(0, 'CHF') } as BookingLineModel);

const centers = [cc('sport', '300', '', 'group'), cc('jun', '310', 'sport', 'leaf'), cc('sen', '320', 'sport', 'leaf'), cc('adm', '400', '', 'leaf')];
const accounts = [acct('a4000', '4000'), acct('a4100', '4100'), acct('a3000', '3000')];

const budgetA = [bl('l1', 'jun', 'a4000', 10000), bl('l2', 'jun', 'a4100', 5000), bl('l3', 'sen', 'a4000', 7000), bl('l4', 'adm', 'a4000', 2000)];
const budgetB = [bl('m1', 'jun', 'a4000', 12000)];
const actuals = [
  booking('x1', 'jun', 'a4000', 9000),
  booking('x2', 'sport', 'a4100', 1000), // a former leaf: booked on the group itself
  booking('x3', undefined, 'a4000', 300), // ohne Kostenstelle
  booking('x4', 'gone', 'a4000', 700), // not in the tree
];
const cells = aggregateByCostCenter(actuals, accounts, budgetA, budgetB);
const rollUp = rollUpCostCenters(cells, centers);
const build = (expanded: string[], side: 'expense' | 'revenue' = 'expense') =>
  buildComparisonRows(cells, rollUp, centers, accounts, new Set(expanded), side);
const keys = (rows: ComparisonRow[]) => rows.map(r => r.key);

describe('buildComparisonRows', () => {
  it('collapsed: only top-level centres, then the buckets last', () => {
    expect(keys(build([]).rows)).toEqual(['center:sport', 'center:adm', 'bucket:none', 'bucket:unknown']);
  });

  it('expanded group shows its own account rows and its children, children collapsed', () => {
    const rows = build(['center:sport']).rows;
    expect(keys(rows)).toEqual(['center:sport', 'account:sport:a4100', 'center:jun', 'center:sen', 'center:adm', 'bucket:none', 'bucket:unknown']);
    expect(rows.find(r => r.key === 'center:jun')?.depth).toBe(1);
    expect(rows.find(r => r.key === 'account:sport:a4100')?.actual).toBe(1000);
  });

  it('expanded leaf shows its accounts sorted by account number', () => {
    const rows = build(['center:sport', 'center:jun']).rows;
    expect(keys(rows).filter(k => k.startsWith('account:jun'))).toEqual(['account:jun:a4000', 'account:jun:a4100']);
  });

  it('puts the unknown cost centre in its own bucket and keeps it out of the tree', () => {
    const unknown = build([]).rows.find(r => r.key === 'bucket:unknown');
    expect(unknown?.actual).toBe(700);
    expect(unknown?.kind).toBe('unknown');
  });

  it('omits empty buckets and rows without any amount', () => {
    const only = aggregateByCostCenter([], accounts, [bl('l1', 'adm', 'a4000', 100)]);
    const r = buildComparisonRows(only, rollUpCostCenters(only, centers), centers, accounts, new Set(), 'expense');
    expect(keys(r.rows)).toEqual(['center:adm']);
  });

  it('percent used is undefined when budget A is 0', () => {
    expect(usedPercent(500, 0)).toBeUndefined();
    expect(usedPercent(500, 1000)).toBe(50);
    const sport = build(['center:sport']).rows.find(r => r.key === 'account:sport:a4100');
    expect(sport?.budget).toBe(0);
    expect(sport?.used).toBeUndefined();
  });

  it('difference is actual minus A and B is carried', () => {
    const jun = build([]).rows.find(r => r.key === 'center:sport');
    expect(jun?.budget).toBe(22000);
    expect(jun?.compare).toBe(12000);
    expect(jun?.diff).toBe(10000 - 22000);
  });

  it('section total equals the sum of the top-level rows and buckets, expanded or not', () => {
    for (const expanded of [[], ['center:sport', 'center:jun', 'center:sen', 'center:adm', 'bucket:none', 'bucket:unknown']]) {
      const { rows, total } = build(expanded);
      const top = rows.filter(r => r.depth === 0);
      expect(top.reduce((s, r) => s + r.actual, 0)).toBe(total.actual);
      expect(top.reduce((s, r) => s + r.budget, 0)).toBe(total.budget);
      expect(top.reduce((s, r) => s + r.compare, 0)).toBe(total.compare);
    }
    expect(build([]).total.actual).toBe(9000 + 1000 + 300 + 700);
  });

  it('an expanded centre\'s children add up to its row', () => {
    const rows = build(['center:sport', 'center:jun', 'center:sen']).rows;
    const sport = rows.find(r => r.key === 'center:sport')!;
    const kids = rows.filter(r => r.depth === 1 && (r.key.startsWith('account:sport') || r.key === 'center:jun' || r.key === 'center:sen'));
    expect(kids.reduce((s, r) => s + r.actual, 0)).toBe(sport.actual);
    expect(kids.reduce((s, r) => s + r.budget, 0)).toBe(sport.budget);
  });

  it('revenue side is separate', () => {
    expect(build([], 'revenue').rows).toEqual([]);
  });
});

describe('defaultCompareVersion', () => {
  const v = (okey: string, status: 'draft' | 'approved' | 'superseded', extra: Partial<BudgetVersionModel> = {}): BudgetVersionModel =>
    ({ ...new BudgetVersionModel('scs', 'scs', 2027), okey, status, ...extra });

  it('prefers the newest approved budget', () => {
    const versions = [v('d1', 'draft'), v('a1', 'approved', { approvedAt: '20261101' }), v('a2', 'approved', { approvedAt: '20261201' })];
    expect(defaultCompareVersion(versions, 2027)?.okey).toBe('a2');
  });

  it('falls back to the last draft, ignores archived and other years', () => {
    const versions = [v('d1', 'draft'), v('d2', 'draft'), v('d3', 'draft', { isArchived: true }), v('d4', 'draft', { fiscalYear: 2028 })];
    expect(defaultCompareVersion(versions, 2027)?.okey).toBe('d2');
    expect(defaultCompareVersion(versions, 2029)).toBeUndefined();
  });
});
