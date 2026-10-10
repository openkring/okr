import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BudgetLineModel, CostCenterModel, MoneyModel } from '@okr/shared-models';
import { aggregateByCostCenter } from '@okr/finance-cost-center-util';

import { buildAccountComparison, totalsByAccount } from './budget-account-compare.util';
import { buildBudgetGrid, netOf } from './budget-grid.util';

const cc = (okey: string, id: string, parentKey: string, type: 'root' | 'group' | 'leaf'): CostCenterModel =>
  ({ ...new CostCenterModel('scs', 'scs'), okey, id, name: okey, parentKey, type });
const acct = (okey: string, id: string): AccountModel => ({ ...new AccountModel('scs'), okey, id, name: `A${id}` });
const line = (okey: string, costCenterKey: string, accountKey: string, amount: number): BudgetLineModel =>
  ({ ...new BudgetLineModel('scs', 'scs', 'v1'), okey, costCenterKey, accountKey, amount: new MoneyModel(amount, 'CHF') });

const centers = [cc('sport', '300', '', 'group'), cc('jun', '310', 'sport', 'leaf'), cc('sen', '320', 'sport', 'leaf'), cc('adm', '400', '', 'leaf')];
const accounts = [acct('a4000', '4000'), acct('a4100', '4100'), acct('a3000', '3000')];

describe('buildBudgetGrid', () => {
  const lines = [line('l1', 'jun', 'a4100', 20000), line('l2', 'jun', 'a4000', 10000), line('l3', 'sen', 'a3000', 50000)];
  const cells = aggregateByCostCenter([], accounts, lines);

  it('sorts rows by account number and computes remaining', () => {
    const grid = buildBudgetGrid(cells, lines, centers, accounts, false);
    const jun = grid.sections.find(s => s.center.okey === 'jun');
    expect(jun?.rows.map(r => r.accountId)).toEqual(['4000', '4100']);
    expect(jun?.rows[0].remaining).toBe(10000);
  });

  it('frozen: hides leaves without cells, keeps the group of a shown leaf', () => {
    const grid = buildBudgetGrid(cells, lines, centers, accounts, false);
    expect(grid.sections.map(s => s.center.okey)).toEqual(['sport', 'jun', 'sen']);
    expect(grid.sections[0].isLeaf).toBe(false);
  });

  it('draft: shows every active leaf', () => {
    const grid = buildBudgetGrid(cells, lines, centers, accounts, true);
    expect(grid.sections.map(s => s.center.okey)).toEqual(['sport', 'jun', 'sen', 'adm']);
  });

  it('totals: group rolls up, grand total sums leaves, net = revenue - expense', () => {
    const grid = buildBudgetGrid(cells, lines, centers, accounts, false);
    expect(grid.sections[0].totals.expense.budget).toBe(30000);
    expect(grid.total.revenue.budget).toBe(50000);
    expect(netOf(grid.total, 'budget')).toBe(20000);
  });

  it('ignores archived lines', () => {
    const archived = [{ ...line('x', 'jun', 'a4000', 999), isArchived: true }];
    const grid = buildBudgetGrid(aggregateByCostCenter([], accounts, archived), archived, centers, accounts, false);
    expect(grid.sections).toEqual([]);
  });

  const sum = (rows: { actual: number; budget: number }[]) => ({ a: rows.reduce((t, r) => t + r.actual, 0), b: rows.reduce((t, r) => t + r.budget, 0) });
  const booking = (costCenterKey: string, accountKey: string, debit: number) =>
    ({ ...new BookingLineModel('scs', 'scs'), bookingKey: 'bk1', costCenterKey, accountKey, debitAmount: new MoneyModel(debit, 'CHF') });

  it('unbudgeted actuals on a budgeted leaf become a «nicht budgetiert» row; footer = Σ rows', () => {
    const jl = [line('l1', 'jun', 'a4000', 10000)];
    const bl = [booking('jun', 'a4000', 4000), booking('jun', 'a4100', 2500)];
    const c = aggregateByCostCenter(bl, accounts, jl);
    const grid = buildBudgetGrid(c, jl, centers, accounts, false);
    const jun = grid.sections.find(s => s.center.okey === 'jun')!;
    expect(jun.rows.map(r => [r.accountId, r.budgeted, r.budget, r.actual])).toEqual([['4000', true, 10000, 4000], ['4100', false, 0, 2500]]);
    expect(jun.rows[1].line).toBeUndefined();
    expect(sum(jun.rows)).toEqual({ a: jun.totals.expense.actual, b: jun.totals.expense.budget });
    expect(grid.total.expense.actual).toBe(6500);
  });

  it('frozen: a leaf with actuals but no cells is shown', () => {
    const c = aggregateByCostCenter([booking('adm', 'a4000', 700)], accounts, []);
    const grid = buildBudgetGrid(c, [], centers, accounts, false);
    expect(grid.sections.map(s => s.center.okey)).toEqual(['adm']);
    expect(grid.sections[0].rows[0].budgeted).toBe(false);
  });

  it('actuals on a group are rows of the group and counted once in the grand total', () => {
    const jl = [line('l1', 'jun', 'a4000', 10000)];
    const c = aggregateByCostCenter([booking('sport', 'a4000', 300), booking('jun', 'a4000', 100)], accounts, jl);
    const grid = buildBudgetGrid(c, jl, centers, accounts, false);
    const sport = grid.sections.find(s => s.center.okey === 'sport')!;
    expect(sport.isLeaf).toBe(false);
    expect(sport.rows.map(r => r.actual)).toEqual([300]);
    expect(sport.totals.expense.actual).toBe(400); // header roll-up
    expect(grid.total.expense.actual).toBe(400);   // not 800
    expect(grid.total.expense.budget).toBe(10000);
  });

  it('unassigned actuals are their own bucket and part of the grand total', () => {
    const c = aggregateByCostCenter([booking('', 'a4000', 50)], accounts, []);
    const grid = buildBudgetGrid(c, [], centers, accounts, false);
    expect(grid.unassigned.expense.actual).toBe(50);
    expect(grid.unknown.expense.actual).toBe(0);
    expect(grid.total.expense.actual).toBe(50);
  });

  it('cells on an unknown Kostenstelle do not vanish: own bucket, counted in the total', () => {
    const c = aggregateByCostCenter([booking('gone', 'a4000', 70)], accounts, [line('l9', 'gone', 'a4000', 900)]);
    const grid = buildBudgetGrid(c, [], centers, accounts, false);
    expect(grid.unknown.expense).toEqual({ actual: 70, budget: 900, compare: 0 });
    expect(grid.sections).toEqual([]);
    expect(grid.total.expense.actual).toBe(70);
  });

  it('grand total equals the account comparison totals for the same cells (incl. both buckets)', () => {
    const jl = [line('l1', 'jun', 'a4000', 10000), line('l3', 'sen', 'a3000', 50000), line('l8', '', 'a4000', 300), line('l9', 'gone', 'a3000', 40)];
    const bl = [booking('jun', 'a4000', 4000), booking('', 'a4100', 25), booking('gone', 'a4000', 7), booking('sport', 'a4000', 11)];
    const c = aggregateByCostCenter(bl, accounts, jl);
    const grid = buildBudgetGrid(c, jl, centers, accounts, false);
    const cmp = buildAccountComparison(accounts, totalsByAccount(c), new Set(), { revenue: 'R', expense: 'E', other: 'O', net: 'N' });
    expect(grid.total.expense.actual).toBe(cmp.expense.actual);
    expect(grid.total.expense.budget).toBe(cmp.expense.budget);
    expect(grid.total.revenue.actual).toBe(cmp.revenue.actual + cmp.other.actual);
    expect(grid.total.revenue.budget).toBe(cmp.revenue.budget + cmp.other.budget);
    expect(grid.unassigned.expense.actual).toBe(25);
    expect(grid.unknown.expense.actual).toBe(7);
  });

  it('carries the side of each row', () => {
    const grid = buildBudgetGrid(cells, lines, centers, accounts, false);
    expect(grid.sections.find(s => s.center.okey === 'sen')?.rows[0].side).toBe('revenue');
    expect(grid.sections.find(s => s.center.okey === 'jun')?.rows[0].side).toBe('expense');
  });
});
