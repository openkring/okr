import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CostAllocationMode, CostAllocationSide } from '@okr/shared-models';
import { numberValidations, stringValidations } from '@okr/shared-util-core';

/** The form's flat view of a CostAllocationModel (amount in minor units). */
export interface CostAllocationFormModel {
  title: string; fiscalYear: number; side: CostAllocationSide; fromCostCenterKey: string; toCostCenterKey: string;
  mode: CostAllocationMode; amount: number; percent: number; notes: string;
}

export const ALLOCATION_TITLE_LENGTH = 60;

/**
 * An Umlage rule (spec 1.65 D24). `costCenterKeys` = the Kostenstellen a rule may name (live leaves of the books).
 */
export const costAllocationValidations = staticSuite((model: CostAllocationFormModel, costCenterKeys: Set<string> = new Set()) => {
  stringValidations('title', model.title, ALLOCATION_TITLE_LENGTH, 1, true);
  numberValidations('fiscalYear', model.fiscalYear, true, 2000, 2100);
  // selector values: no length cap (building-forms)
  stringValidations('side', model.side, undefined, 0, true);
  stringValidations('mode', model.mode, undefined, 0, true);
  stringValidations('fromCostCenterKey', model.fromCostCenterKey, undefined, 0, true);
  stringValidations('toCostCenterKey', model.toCostCenterKey, undefined, 0, true);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  omitWhen(!model.fromCostCenterKey, () => {
    test('fromCostCenterKey', '@finance/budget/feature.allocation.costCenter.unknown', () => {
      enforce(costCenterKeys.has(model.fromCostCenterKey)).isTruthy();
    });
  });
  omitWhen(!model.toCostCenterKey, () => {
    test('toCostCenterKey', '@finance/budget/feature.allocation.costCenter.unknown', () => {
      enforce(costCenterKeys.has(model.toCostCenterKey)).isTruthy();
    });
    test('toCostCenterKey', '@finance/budget/feature.allocation.to.same', () => {
      enforce(model.toCostCenterKey !== model.fromCostCenterKey).isTruthy();
    });
  });
  omitWhen(model.mode !== 'percent', () => {
    test('percent', '@finance/budget/feature.allocation.percent.range', () => {
      enforce(typeof model.percent === 'number' && model.percent > 0 && model.percent <= 100).isTruthy();
    });
  });
  omitWhen(model.mode !== 'amount', () => {
    test('amount', '@finance/budget/feature.allocation.amount.positive', () => {
      enforce(typeof model.amount === 'number' && model.amount > 0).isTruthy();
    });
  });
});
