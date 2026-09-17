import { enforce, only, staticSuite, test } from 'vest';

import { MemberFeeModel } from '@okr/shared-models';
import { baseValidations, numberValidations } from '@okr/shared-util-core';

/**
 * The name a position's amount is validated under. Per-item failures are filed under an indexed
 * field name (same shape as `tagValidations`' `tags[0]`), so a form must filter its error notes
 * by this prefix — `getErrors('positions')` alone finds nothing.
 */
export function positionAmountField(index: number): string {
  return `positions[${index}].amount`;
}

export const memberFeeValidations = staticSuite((model: MemberFeeModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  // One rule set per position. `key`, `usage`, `type` and `label` come from the fee schedule —
  // generated/selector values that must never carry a length cap (building-forms, rule 1).
  (model.positions ?? []).forEach((position, index) => {
    numberValidations(positionAmountField(index), position.amount, false, 0);
  });

  test('state', 'required', () => { enforce(model.state).isNotEmpty(); });
});
