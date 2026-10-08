import { describe, expect, it } from 'vitest';

import { AccountModel, BudgetLineModel, BudgetVersionModel, MoneyModel } from '@okr/shared-models';

import { budgetCellKey, copyBudgetLines, isBudgetableAccount, isVersionEditable, newestApprovedBudget, planApproval } from './budget.util';

const v = (okey: string, p: Partial<BudgetVersionModel>): BudgetVersionModel =>
  ({ ...new BudgetVersionModel('scs', 'scs', 2027), okey, ...p });
const line = (okey: string, versionKey: string, cc: string, acct: string, amount: number): BudgetLineModel =>
  ({ ...new BudgetLineModel('scs', 'scs', versionKey), okey, costCenterKey: cc, accountKey: acct, amount: new MoneyModel(amount) });

describe('isVersionEditable', () => {
  it('draft yes', () => expect(isVersionEditable({ status: 'draft', isArchived: false })).toBe(true));
  it('approved no', () => expect(isVersionEditable({ status: 'approved', isArchived: false })).toBe(false));
  it('superseded no', () => expect(isVersionEditable({ status: 'superseded', isArchived: false })).toBe(false));
  it('archived draft no', () => expect(isVersionEditable({ status: 'draft', isArchived: true })).toBe(false));
});

describe('newestApprovedBudget', () => {
  const versions = [
    v('a', { status: 'superseded', approvedAt: '20261120' }),
    v('b', { status: 'approved', approvedAt: '20270315' }),
    v('f', { status: 'approved', kind: 'forecast', approvedAt: '20270601' }),
    v('x', { status: 'approved', fiscalYear: 2026, approvedAt: '20260101' }),
    v('z', { status: 'approved', approvedAt: '20270701', isArchived: true }),
  ];
  it('budget kind, same year, not archived', () => expect(newestApprovedBudget(versions, 2027)?.okey).toBe('b'));
  it('forecast when asked', () => expect(newestApprovedBudget(versions, 2027, 'forecast')?.okey).toBe('f'));
  it('none -> undefined', () => expect(newestApprovedBudget(versions, 2030)).toBeUndefined());
});

describe('planApproval', () => {
  const approval = { approvedAt: '20261120', approvedBy: 'gv' as const, approvalRef: 'GV-Protokoll' };
  it('supersedes the approved version of the same year and kind only', () => {
    const versions = [
      v('old', { status: 'approved' }), v('fc', { status: 'approved', kind: 'forecast' }),
      v('y26', { status: 'approved', fiscalYear: 2026 }), v('new', { status: 'draft' }),
    ];
    const plan = planApproval(versions, versions[3], approval);
    expect(plan.supersede).toEqual(['old']);
    expect(plan.approve).toEqual({ okey: 'new', status: 'approved', ...approval });
  });
  it('refuses a non-draft target', () =>
    expect(() => planApproval([], v('a', { status: 'approved' }), approval)).toThrow('budget-not-draft'));
});

describe('copyBudgetLines', () => {
  it('copies only the base version, fresh okeys, new versionKey, amounts kept', () => {
    const lines = [line('l1', 'base', 'cc1', 'a6000', 50000), line('l2', 'other', 'cc1', 'a6000', 1)];
    const out = copyBudgetLines(lines, 'base', 'next');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ okey: '', versionKey: 'next', costCenterKey: 'cc1', accountKey: 'a6000' });
    expect(out[0].amount.amount).toBe(50000);
    expect(out[0].amount).not.toBe(lines[0].amount);
  });
  it('skips archived lines', () =>
    expect(copyBudgetLines([{ ...line('l1', 'base', 'c', 'a', 1), isArchived: true }], 'base', 'n')).toHaveLength(0));
});

it('budgetCellKey', () => expect(budgetCellKey('cc1', 'a6000')).toBe('cc1|a6000'));

describe('isBudgetableAccount', () => {
  const acct = (okey: string, id: string, p: Partial<AccountModel> = {}): AccountModel =>
    Object.assign(new AccountModel('scs'), { okey, id }, p);
  const a6000 = acct('a6000', '6000');
  const a1020 = acct('a1020', '1020');
  it('P&L leaf -> true', () => expect(isBudgetableAccount(a6000, [a6000, a1020])).toBe(true));
  it('balance-sheet leaf -> false', () => expect(isBudgetableAccount(a1020, [a6000, a1020])).toBe(false));
  it('P&L with child -> false', () =>
    expect(isBudgetableAccount(a6000, [a6000, acct('c', '6000.1', { parentKey: 'a6000' })])).toBe(false));
  it('archived -> false', () => {
    const arch = acct('a6100', '6100', { isArchived: true });
    expect(isBudgetableAccount(arch, [arch])).toBe(false);
  });
});
