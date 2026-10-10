import { describe, expect, it } from 'vitest';

import { AccountModel, BookingLineModel, BudgetLineModel, MoneyModel } from '@okr/shared-models';
import { aggregateByCostCenter } from '@okr/finance-cost-center-util';

import { buildAccountComparison, totalsByAccount } from './budget-account-compare.util';

const a = (okey: string, id: string, parentKey = '', isArchived = false): AccountModel =>
  ({ ...new AccountModel('scs'), okey, id, name: `N${id}`, parentKey, isArchived });
const bl = (okey: string, costCenterKey: string, accountKey: string, amount: number): BudgetLineModel =>
  ({ ...new BudgetLineModel('scs', 'scs', 'v1'), okey, costCenterKey, accountKey, amount: new MoneyModel(amount, 'CHF') });
const line = (okey: string, accountKey: string, debit: number, credit: number, costCenterKey = ''): BookingLineModel =>
  ({ ...new BookingLineModel('scs', 'scs'), okey, bookingKey: 'b1', accountKey, costCenterKey,
     debitAmount: new MoneyModel(debit, 'CHF'), creditAmount: new MoneyModel(credit, 'CHF') } as BookingLineModel);

// chart: root › 3 Ertrag › 3400, 3401 ; 4 Aufwand › 4010, 4021 ; 8 übriger Erfolg › 8709
const accounts = [
  a('root', ''), a('g3', '3', 'root'), a('a3400', '3400', 'g3'), a('a3401', '3401', 'g3'),
  a('g4', '4', 'root'), a('a4010', '4010', 'g4'), a('a4021', '4021', 'g4'),
  a('g8', '8', 'root'), a('a8709', '8709', 'g8'),
];
const LABELS = { revenue: 'Ertrag', expense: 'Aufwand', other: 'übriger Erfolg', net: 'Ergebnis' };
const budgetA = [bl('b1', 'k1', 'a3401', 125000), bl('b2', 'k2', 'a3401', 5000), bl('b3', 'k1', 'a4010', 30000), bl('b4', 'k1', 'a4021', -10000)];
const budgetB = [bl('c1', 'k1', 'a3401', 120000)];
const actuals = [line('x1', 'a3401', 0, 100000, 'k1'), line('x2', 'a4010', 20000, 0, 'k1'), line('x3', 'a8709', 0, 500)];
const cells = aggregateByCostCenter(actuals, accounts, budgetA, budgetB);
const all = new Set(['g3', 'g4', 'g8']);

describe('totalsByAccount', () => {
  it('sums the cells of all Kostenstellen per account', () => {
    expect(totalsByAccount(cells).get('a3401')).toEqual({ actual: 100000, budget: 130000, compare: 120000 });
  });
});

describe('buildAccountComparison', () => {
  const r = buildAccountComparison(accounts, totalsByAccount(cells), all, LABELS);
  const byKey = (k: string) => r.rows.find(x => x.key === k);

  it('follows the ER order: revenue, its total, expense, its total, other, its total, net', () => {
    expect(r.rows.map(x => x.key)).toEqual(['g3', 'a3401', 'total-revenue', 'g4', 'a4010', 'a4021', 'total-expense', 'g8', 'a8709', 'total-other', 'net']);
  });
  it('drops accounts without actual, budget or compare (3400)', () => expect(byKey('a3400')).toBeUndefined());
  it('a group is the sum of its children and collapses them', () => {
    expect(byKey('g4')).toMatchObject({ kind: 'group', budget: 20000, actual: 20000, expandable: true, expanded: true });
    const closed = buildAccountComparison(accounts, totalsByAccount(cells), new Set(), LABELS);
    expect(closed.rows.map(x => x.key)).toEqual(['g3', 'total-revenue', 'g4', 'total-expense', 'g8', 'total-other', 'net']);
  });
  it('keeps a negative budget (D17) and computes difference and percent', () => {
    expect(byKey('a4021')).toMatchObject({ budget: -10000, actual: 0, diff: 10000 });
    expect(byKey('a3401')).toMatchObject({ diff: -30000, used: 77, side: 'revenue' });
    expect(byKey('a4010')?.side).toBe('expense');
  });
  it('net = revenue + other − expense per column', () => {
    expect(r.net).toEqual({ actual: 100000 + 500 - 20000, budget: 130000 - 20000, compare: 120000 });
    expect(byKey('net')).toMatchObject({ kind: 'result', side: 'net', actual: 80500, budget: 110000 });
  });
  it('compare column is independent of actuals', () => {
    const noActuals = aggregateByCostCenter([], accounts, budgetA, budgetB);
    expect(buildAccountComparison(accounts, totalsByAccount(noActuals), all, LABELS).net.compare).toBe(120000);
  });
  it('omits the other-section total when the section is empty', () => {
    const c = aggregateByCostCenter([], accounts, budgetA, []);
    expect(buildAccountComparison(accounts, totalsByAccount(c), all, LABELS).rows.some(x => x.key === 'total-other')).toBe(false);
  });
  it('a group\'s own budget (former leaf) counts in the group and shows as its own row when open', () => {
    const c = aggregateByCostCenter([], accounts, [bl('g', 'k1', 'g4', 5000), bl('h', 'k1', 'a4010', 1000)], []);
    const open = buildAccountComparison(accounts, totalsByAccount(c), all, LABELS);
    expect(open.rows.find(x => x.key === 'g4')).toMatchObject({ budget: 6000 });
    expect(open.rows.find(x => x.key === 'own:g4')).toMatchObject({ kind: 'account', id: '4', depth: 1, budget: 5000 });
    expect(open.expense.budget).toBe(6000);
    const closed = buildAccountComparison(accounts, totalsByAccount(c), new Set(), LABELS);
    expect(closed.rows.some(x => x.key === 'own:g4')).toBe(false);
    expect(closed.rows.find(x => x.key === 'g4')?.budget).toBe(6000);
  });
  it('an archived account is listed under its live parent group, hidden while the group is closed', () => {
    const withArchived = [...accounts, a('a4099', '4099', 'g4', true)];
    const c = aggregateByCostCenter([], withArchived, [bl('z', 'k1', 'a4099', 700), bl('y', 'k1', 'a4010', 100)], []);
    const open = buildAccountComparison(withArchived, totalsByAccount(c), all, LABELS);
    const keys = open.rows.map(x => x.key);
    expect(keys.indexOf('a4099')).toBeGreaterThan(keys.indexOf('g4'));
    expect(keys.indexOf('a4099')).toBeLessThan(keys.indexOf('total-expense'));
    expect(open.rows.find(x => x.key === 'g4')?.budget).toBe(800);
    const closed = buildAccountComparison(withArchived, totalsByAccount(c), new Set(), LABELS);
    expect(closed.rows.some(x => x.key === 'a4099')).toBe(false);
    expect(closed.expense.budget).toBe(800);
  });
  it('an archived account without a live parent is a top-level row of its class', () => {
    const withArchived = [...accounts, a('gOld', '49', 'root', true), a('a4901', '4901', 'gOld', true)];
    const c = aggregateByCostCenter([], withArchived, [bl('z', 'k1', 'a4901', 300)], []);
    const res = buildAccountComparison(withArchived, totalsByAccount(c), all, LABELS);
    expect(res.rows.find(x => x.key === 'a4901')).toMatchObject({ depth: 0, side: 'expense', budget: 300 });
    expect(res.expense.budget).toBe(300);
  });
  it('budget on an archived account still counts in the totals', () => {
    const withArchived = [...accounts, a('a4099', '4099', 'g4', true)];
    const c = aggregateByCostCenter([], withArchived, [bl('z', 'k1', 'a4099', 700)], []);
    const res = buildAccountComparison(withArchived, totalsByAccount(c), all, LABELS);
    expect(res.expense.budget).toBe(700);
    expect(res.rows.find(x => x.key === 'a4099')).toMatchObject({ kind: 'account', budget: 700, depth: 1 });
  });
});
