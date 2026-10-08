import { describe, expect, it } from 'vitest';

import { AccountModel, BudgetLineModel, CostCenterModel, MoneyModel } from '@okr/shared-models';
import { aggregateByCostCenter } from '@okr/finance-cost-center-util';

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
});
