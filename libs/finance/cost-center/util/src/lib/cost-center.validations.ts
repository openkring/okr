import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { CostCenterModel, CostCenterType } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { wouldCreateCycle } from './cost-center.util';

export interface CostCenterFormModel {
  okey: string;
  id: string;
  name: string;
  parentKey: string;
  type: CostCenterType;
  responsibilityKey: string;
  notes: string;
}

export const COST_CENTER_ID_LENGTH = 10;
export const COST_CENTER_NAME_LENGTH = 60;

/**
 * @param existing all cost centres of the accounting tenant (archived ones included): the number
 *                 must stay unique among them, a move must not create a cycle, a leaf has no
 *                 children and a parent is a root or a group.
 */
export const costCenterValidations = staticSuite((model: CostCenterFormModel, existing: CostCenterModel[] = [], field?: string) => {
  if (field) only(field);

  stringValidations('id', model.id, COST_CENTER_ID_LENGTH, 1, true);
  stringValidations('name', model.name, COST_CENTER_NAME_LENGTH, 1, true);
  stringValidations('type', model.type, undefined, 0, true);
  // parentKey / responsibilityKey are chosen from a list: no length cap (see building-forms skill).
  stringValidations('parentKey', model.parentKey);
  stringValidations('responsibilityKey', model.responsibilityKey);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  omitWhen(!model.id, () => {
    test('id', '@finance/cost-center/feature.id.duplicate', () => {
      enforce(existing.some(c => c.okey !== model.okey && c.id === model.id)).isFalsy();
    });
  });

  omitWhen(!model.parentKey, () => {
    test('parentKey', '@finance/cost-center/feature.parentKey.cycle', () => {
      enforce(wouldCreateCycle(existing, model.okey, model.parentKey)).isFalsy();
    });
    test('parentKey', '@finance/cost-center/feature.parentKey.notGroup', () => {
      const parent = existing.find(c => c.okey === model.parentKey);
      enforce(!!parent && parent.type !== 'leaf').isTruthy();
    });
  });

  // An unsaved node (okey '') has no children yet — and '' is also every top-level node's
  // parentKey, so without this guard the check would match all of them.
  omitWhen(model.type !== 'leaf' || !model.okey, () => {
    test('type', '@finance/cost-center/feature.type.hasChildren', () => {
      enforce(existing.some(c => c.parentKey === model.okey && c.okey !== model.okey)).isFalsy();
    });
  });
});
