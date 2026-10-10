import { describe, expect, it } from 'vitest';

import { BudgetLineModel } from '@okr/shared-models';

import {
  BUDGET_APPROVAL_REF_LENGTH, BUDGET_NAME_LENGTH, BudgetApprovalFormModel, BudgetLineFormModel, BudgetVersionFormModel,
  budgetApprovalValidations, budgetLineValidations, budgetVersionValidations,
} from './budget.validations';

const ver = (over: Partial<BudgetVersionFormModel> = {}): BudgetVersionFormModel =>
  ({ okey: 'v', name: 'Budget GV 2027', kind: 'budget', fiscalYear: 2027, notes: '', ...over });

describe('budgetVersionValidations', () => {
  it('accepts a valid version', () => expect(budgetVersionValidations(ver()).isValid()).toBe(true));
  it('name: required', () => expect(budgetVersionValidations(ver({ name: '' })).getErrors('name')).toContain('required'));
  it('name: too long', () => {
    expect(budgetVersionValidations(ver({ name: 'x'.repeat(BUDGET_NAME_LENGTH + 1) })).getErrors('name')).toContain('tooLong');
    expect(budgetVersionValidations(ver({ name: 'x'.repeat(BUDGET_NAME_LENGTH) })).getErrors('name')).toEqual([]);
  });
  it('kind: required', () => expect(budgetVersionValidations(ver({ kind: '' as never })).getErrors('kind')).toContain('required'));
  it('fiscalYear: integer within 2000..2100', () => {
    expect(budgetVersionValidations(ver({ fiscalYear: 1999 })).getErrors('fiscalYear')).toContain('tooSmall');
    expect(budgetVersionValidations(ver({ fiscalYear: 2101 })).getErrors('fiscalYear')).toContain('tooLarge');
    expect(budgetVersionValidations(ver({ fiscalYear: 2027.5 })).getErrors('fiscalYear')).toContain('notInteger');
    expect(budgetVersionValidations(ver({ fiscalYear: 2100 })).getErrors('fiscalYear')).toEqual([]);
  });
});

const appr = (over: Partial<BudgetApprovalFormModel> = {}): BudgetApprovalFormModel =>
  ({ approvedAt: '20261120', approvedBy: 'gv', approvalRef: 'GV-Protokoll', ...over });

describe('budgetApprovalValidations', () => {
  it('accepts a valid approval', () => expect(budgetApprovalValidations(appr()).isValid()).toBe(true));
  it('approvedAt: required', () => expect(budgetApprovalValidations(appr({ approvedAt: '' })).getErrors('approvedAt')).toContain('required'));
  it('approvedAt: must be a date', () =>
    expect(budgetApprovalValidations(appr({ approvedAt: '20261340' })).getErrors('approvedAt')).toContain('invalidDate'));
  it('approvedBy: required', () => expect(budgetApprovalValidations(appr({ approvedBy: '' })).getErrors('approvedBy')).toContain('required'));
  it('approvedBy: gv or board only', () => {
    expect(budgetApprovalValidations(appr({ approvedBy: 'x' as never })).getErrors('approvedBy')).toContain('@finance/budget/feature.approvedBy.invalid');
    expect(budgetApprovalValidations(appr({ approvedBy: 'board' })).getErrors('approvedBy')).toEqual([]);
  });
  it('approvalRef: optional, capped', () => {
    expect(budgetApprovalValidations(appr({ approvalRef: '' })).isValid()).toBe(true);
    expect(budgetApprovalValidations(appr({ approvalRef: 'x'.repeat(BUDGET_APPROVAL_REF_LENGTH + 1) })).getErrors('approvalRef')).toContain('tooLong');
  });
});

const ex = (okey: string, cc: string, acct: string): BudgetLineModel =>
  Object.assign(new BudgetLineModel('scs', 'scs', 'v'), { okey, costCenterKey: cc, accountKey: acct });
const existing = [ex('l1', 'cc1', 'a6000')];
const leaves = new Set(['cc1', 'cc2']);
const accts = new Set(['a6000', 'a6100']);
const ln = (over: Partial<BudgetLineFormModel> = {}): BudgetLineFormModel =>
  ({ okey: 'n', costCenterKey: 'cc2', accountKey: 'a6000', amount: 100, notes: '', ...over });
const run = (m: BudgetLineFormModel) => budgetLineValidations(m, existing, leaves, accts);

describe('budgetLineValidations', () => {
  it('accepts a valid line', () => expect(run(ln()).isValid()).toBe(true));
  it('costCenterKey: required', () => expect(run(ln({ costCenterKey: '' })).getErrors('costCenterKey')).toContain('required'));
  it('costCenterKey: must be a leaf', () => {
    expect(run(ln({ costCenterKey: 'grp' })).getErrors('costCenterKey')).toContain('@finance/budget/feature.costCenterKey.notLeaf');
  });
  it('costCenterKey: no length cap', () => {
    const big = new Set(['k'.repeat(500)]);
    expect(budgetLineValidations(ln({ costCenterKey: 'k'.repeat(500) }), [], big, accts).getErrors('costCenterKey')).toEqual([]);
  });
  it('accountKey: required', () => expect(run(ln({ accountKey: '' })).getErrors('accountKey')).toContain('required'));
  it('accountKey: must be budgetable', () =>
    expect(run(ln({ accountKey: 'a1020' })).getErrors('accountKey')).toContain('@finance/budget/feature.accountKey.notBudgetable'));
  it('amount: negative (opposite direction, e.g. a fund release) and zero are ok', () => {
    expect(run(ln({ amount: -1 })).getErrors('amount')).toEqual([]);
    expect(run(ln({ amount: 0 })).getErrors('amount')).toEqual([]);
  });
  it('duplicate cell under another okey is an error', () =>
    expect(run(ln({ costCenterKey: 'cc1', accountKey: 'a6000' })).getErrors('accountKey')).toContain('@finance/budget/feature.accountKey.duplicate'));
  it('same okey is no duplicate', () =>
    expect(run(ln({ okey: 'l1', costCenterKey: 'cc1', accountKey: 'a6000' })).getErrors('accountKey')).toEqual([]));
});
