import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BookingModel, BudgetLineModel, CostCenterModel, MoneyModel } from '@okr/shared-models';

import { aggregateByCostCenter, NO_COST_CENTER_KEY, postedLinesInRange, rollUpCostCenters } from './cost-center-aggregate';

const acct = (okey: string, id: string, parentKey = ''): AccountModel => ({ okey, id, parentKey, name: id, isArchived: false } as AccountModel);
const accounts = [acct('a3400', '3400'), acct('a6000', '6000'), acct('a6100', '6100'), acct('a1020', '1020')];
const bl = (bookingKey: string, accountKey: string, debit: number, credit: number, costCenterKey?: string): BookingLineModel =>
  ({ bookingKey, accountKey, debitAmount: new MoneyModel(debit), creditAmount: new MoneyModel(credit), costCenterKey } as BookingLineModel);
const bud = (versionKey: string, cc: string, accountKey: string, amount: number): BudgetLineModel =>
  ({ versionKey, costCenterKey: cc, accountKey, amount: new MoneyModel(amount), isArchived: false } as BudgetLineModel);
const cc = (okey: string, parentKey = '', type: 'root' | 'group' | 'leaf' = 'leaf'): CostCenterModel =>
  ({ okey, parentKey, type, isArchived: false, accountingTenantId: 'scs' } as CostCenterModel);

describe('postedLinesInRange', () => {
  const bookings = [
    { okey: 'b1', status: 'posted', date: '20270310' }, { okey: 'b2', status: 'forReview', date: '20270310' },
    { okey: 'b3', status: 'posted', date: '20260310' }, { okey: 'b4', status: 'cancelled', date: '20270310' },
  ] as BookingModel[];
  it('keeps posted lines dated within the range only', () => {
    const lines = ['b1', 'b2', 'b3', 'b4'].map(k => bl(k, 'a6000', 1, 0));
    expect(postedLinesInRange(lines, bookings, '20270101', '20271231').map(l => l.bookingKey)).toEqual(['b1']);
  });
});

describe('aggregateByCostCenter', () => {
  const lines = [
    bl('b1', 'a6000', 70000, 0, 'jun'), bl('b1', 'a6000', 50000, 0, 'reg'),   // one account split over two Kostenstellen
    bl('b1', 'a1020', 0, 120000),                                            // balance sheet: ignored
    bl('b2', 'a3400', 0, 30000, 'jun'), bl('b2', 'a6100', 2000, 0),         // revenue; and a line without Kostenstelle
    bl('b3', 'a6000', 0, 5000, 'jun'),                                       // a credit on an expense account reduces it
  ];
  const cells = aggregateByCostCenter(lines, accounts, [bud('v1', 'jun', 'a6000', 80000), bud('v1', 'sport', 'a6100', 10000)], [bud('v2', 'jun', 'a6000', 90000)]);
  const find = (c: string, a: string) => cells.find(x => x.costCenterKey === c && x.accountKey === a);

  it('expense natural sign, credit reduces', () => expect(find('jun', 'a6000')).toMatchObject({ side: 'expense', actual: 65000, budget: 80000, compare: 90000 }));
  it('revenue credit-positive', () => expect(find('jun', 'a3400')).toMatchObject({ side: 'revenue', actual: 30000, budget: 0 }));
  it('bucket cell for lines without Kostenstelle (undefined on legacy lines)', () => expect(find(NO_COST_CENTER_KEY, 'a6100')?.actual).toBe(2000));
  it('budget without actuals is a cell', () => expect(find('sport', 'a6100')).toMatchObject({ actual: 0, budget: 10000 }));
  it('balance-sheet lines are ignored', () => expect(cells.some(c => c.accountKey === 'a1020')).toBe(false));
  it('Σ actual expense = ER expense total', () =>
    expect(cells.filter(c => c.side === 'expense').reduce((s, c) => s + c.actual, 0)).toBe(70000 + 50000 + 2000 - 5000));
  it('account that became a group keeps its cell and the expense sum (Review-Focus)', () => {
    const withGroup = [...accounts, acct('a6001', '6001', 'a6000')];
    const groupCells = aggregateByCostCenter(lines, withGroup, [bud('v1', 'jun', 'a6000', 80000)], []);
    expect(groupCells.find(c => c.costCenterKey === 'jun' && c.accountKey === 'a6000')).toMatchObject({ actual: 65000, budget: 80000 });
    expect(groupCells.filter(c => c.side === 'expense').reduce((s, c) => s + c.actual, 0)).toBe(117000);
  });
});

describe('rollUpCostCenters', () => {
  const centers = [cc('sport', '', 'group'), cc('jun', 'sport'), cc('reg', 'sport'), cc('admin')];
  const cells = aggregateByCostCenter(
    [bl('b', 'a6000', 700, 0, 'jun'), bl('b', 'a6000', 500, 0, 'reg'), bl('b', 'a6000', 100, 0)],
    accounts, [bud('v', 'jun', 'a6000', 1000)]);
  const map = rollUpCostCenters(cells, centers);

  it('group sums its subtree', () => expect(map.get('sport')?.expense).toEqual({ actual: 1200, budget: 1000, compare: 0 }));
  it('leaf without anything is zero, not missing', () => expect(map.get('admin')?.expense.actual).toBe(0));
  it('bucket entry', () => expect(map.get(NO_COST_CENTER_KEY)?.expense.actual).toBe(100));
  it('Σ top-level + bucket = total', () => {
    const tops = centers.filter(c => !c.parentKey).map(c => map.get(c.okey)?.expense.actual ?? 0);
    expect(tops.reduce((s, x) => s + x, 0) + (map.get(NO_COST_CENTER_KEY)?.expense.actual ?? 0)).toBe(1300);
  });
  it('cell with an unknown Kostenstelle stays in the cells but in no roll-up entry', () => {
    const ghostCells = aggregateByCostCenter([bl('b', 'a6000', 900, 0, 'ghost')], accounts);
    expect(ghostCells).toHaveLength(1);
    const ghostMap = rollUpCostCenters(ghostCells, centers);
    const total = [...ghostMap.values()].reduce((s, e) => s + e.expense.actual, 0);
    expect(total).toBe(0);
    expect(ghostMap.has('ghost')).toBe(false);
  });
});
