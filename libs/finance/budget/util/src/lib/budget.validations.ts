import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { BudgetApprovalBody, BudgetKind, BudgetLineModel } from '@okr/shared-models';
import { dateValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

import { budgetCellKey } from './budget.util';

export interface BudgetVersionFormModel { okey: string; name: string; kind: BudgetKind; fiscalYear: number; notes: string }
export interface BudgetApprovalFormModel { approvedAt: string; approvedBy: BudgetApprovalBody | ''; approvalRef: string }
export interface BudgetLineFormModel { okey: string; costCenterKey: string; accountKey: string; amount: number; notes: string }

export const BUDGET_NAME_LENGTH = 60;
export const BUDGET_APPROVAL_REF_LENGTH = 100;

export const budgetVersionValidations = staticSuite((model: BudgetVersionFormModel) => {
  stringValidations('name', model.name, BUDGET_NAME_LENGTH, 1, true);
  // kind is chosen from a list: no length cap (see building-forms skill).
  stringValidations('kind', model.kind, undefined, 0, true);
  numberValidations('fiscalYear', model.fiscalYear, true, 2000, 2100);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
});

export const budgetApprovalValidations = staticSuite((model: BudgetApprovalFormModel) => {
  stringValidations('approvedAt', model.approvedAt, undefined, 0, true);
  dateValidations('approvedAt', model.approvedAt);
  stringValidations('approvedBy', model.approvedBy, undefined, 0, true);
  omitWhen(!model.approvedBy, () => {
    test('approvedBy', '@finance/budget/feature.approvedBy.invalid', () => {
      enforce(model.approvedBy === 'gv' || model.approvedBy === 'board').isTruthy();
    });
  });
  stringValidations('approvalRef', model.approvalRef, BUDGET_APPROVAL_REF_LENGTH);
});

/**
 * @param existing  all lines of the same version (the cell must stay unique among them)
 * @param leafKeys  okeys of the leaf cost centres a line may sit on
 * @param budgetableAccountKeys okeys of the active P&L leaf accounts
 */
export const budgetLineValidations = staticSuite(
  (model: BudgetLineFormModel, existing: BudgetLineModel[] = [], leafKeys: Set<string> = new Set(), budgetableAccountKeys: Set<string> = new Set()) => {
    // costCenterKey / accountKey are chosen from a list: no length cap (see building-forms skill).
    stringValidations('costCenterKey', model.costCenterKey, undefined, 0, true);
    stringValidations('accountKey', model.accountKey, undefined, 0, true);
    stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

    omitWhen(!model.costCenterKey, () => {
      test('costCenterKey', '@finance/budget/feature.costCenterKey.notLeaf', () => {
        enforce(leafKeys.has(model.costCenterKey)).isTruthy();
      });
    });
    omitWhen(!model.accountKey, () => {
      test('accountKey', '@finance/budget/feature.accountKey.notBudgetable', () => {
        enforce(budgetableAccountKeys.has(model.accountKey)).isTruthy();
      });
    });
    test('amount', '@finance/budget/feature.amount.negative', () => {
      enforce(typeof model.amount === 'number' && model.amount >= 0).isTruthy();
    });
    omitWhen(!model.costCenterKey || !model.accountKey, () => {
      test('accountKey', '@finance/budget/feature.accountKey.duplicate', () => {
        const cell = budgetCellKey(model.costCenterKey, model.accountKey);
        enforce(existing.some(l => l.okey !== model.okey && !l.isArchived && budgetCellKey(l.costCenterKey, l.accountKey) === cell)).isFalsy();
      });
    });
  },
);
