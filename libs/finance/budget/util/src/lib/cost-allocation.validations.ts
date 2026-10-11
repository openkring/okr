import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CostAllocationMode, CostAllocationScope, CostAllocationSide } from '@okr/shared-models';
import { numberValidations, stringValidations } from '@okr/shared-util-core';

/** The form's flat view of a CostAllocationModel (amount in minor units). */
export interface CostAllocationFormModel {
  title: string; fiscalYear: number; scope: CostAllocationScope; side: CostAllocationSide;
  fromCostCenterKey: string; toCostCenterKey: string; fromProjectKey: string; toProjectKey: string;
  mode: CostAllocationMode; amount: number; percent: number; notes: string;
}

export const ALLOCATION_TITLE_LENGTH = 60;

/**
 * An Umlage rule (spec 1.65 D24/D26). `costCenterKeys` = the Kostenstellen a rule may name (live leaves of the books),
 * `projectKeys` = the projects. The scope decides which ends are Kostenstellen and which are projects; a Projekt →
 * Projekt rule runs over the projects' whole life (fiscal year 0).
 */
export const costAllocationValidations = staticSuite((model: CostAllocationFormModel, costCenterKeys: Set<string> = new Set(), projectKeys: Set<string> = new Set()) => {
  const scope = model.scope ?? 'center';
  stringValidations('title', model.title, ALLOCATION_TITLE_LENGTH, 1, true);
  omitWhen(scope === 'project', () => {
    numberValidations('fiscalYear', model.fiscalYear, true, 2000, 2100);
  });
  // selector values: no length cap (building-forms)
  stringValidations('side', model.side, undefined, 0, true);
  stringValidations('mode', model.mode, undefined, 0, true);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  // source: a Kostenstelle, except for Projekt → Projekt
  omitWhen(scope === 'project', () => {
    stringValidations('fromCostCenterKey', model.fromCostCenterKey, undefined, 0, true);
    omitWhen(!model.fromCostCenterKey, () => {
      test('fromCostCenterKey', '@finance/budget/feature.allocation.costCenter.unknown', () => {
        enforce(costCenterKeys.has(model.fromCostCenterKey)).isTruthy();
      });
    });
  });
  omitWhen(scope !== 'project', () => {
    stringValidations('fromProjectKey', model.fromProjectKey, undefined, 0, true);
    omitWhen(!model.fromProjectKey, () => {
      test('fromProjectKey', '@finance/budget/feature.allocation.project.unknown', () => {
        enforce(projectKeys.has(model.fromProjectKey)).isTruthy();
      });
    });
  });
  // target: a Kostenstelle for Kostenstelle → Kostenstelle, else a project
  omitWhen(scope !== 'center', () => {
    stringValidations('toCostCenterKey', model.toCostCenterKey, undefined, 0, true);
    omitWhen(!model.toCostCenterKey, () => {
      test('toCostCenterKey', '@finance/budget/feature.allocation.costCenter.unknown', () => {
        enforce(costCenterKeys.has(model.toCostCenterKey)).isTruthy();
      });
      test('toCostCenterKey', '@finance/budget/feature.allocation.to.same', () => {
        enforce(model.toCostCenterKey !== model.fromCostCenterKey).isTruthy();
      });
    });
  });
  omitWhen(scope === 'center', () => {
    stringValidations('toProjectKey', model.toProjectKey, undefined, 0, true);
    omitWhen(!model.toProjectKey, () => {
      test('toProjectKey', '@finance/budget/feature.allocation.project.unknown', () => {
        enforce(projectKeys.has(model.toProjectKey)).isTruthy();
      });
      omitWhen(scope !== 'project', () => {
        test('toProjectKey', '@finance/budget/feature.allocation.to.same', () => {
          enforce(model.toProjectKey !== model.fromProjectKey).isTruthy();
        });
      });
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
