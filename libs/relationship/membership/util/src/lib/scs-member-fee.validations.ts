import { enforce, only, staticSuite, test } from 'vest';

import { ScsMemberFeesModel } from '@bk2/shared-models';
import { baseValidations, numberValidations } from '@bk2/shared-util-core';

export const scsMemberFeeValidations = staticSuite((model: ScsMemberFeesModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  test('jb', 'jb must be >= 0', () => { enforce(model.jb).greaterThanOrEquals(0); });
  test('srv', 'srv must be >= 0', () => { enforce(model.srv).greaterThanOrEquals(0); });
  test('bev', 'bev must be >= 0', () => { enforce(model.bev).greaterThanOrEquals(0); });
  test('entryFee', 'entryFee must be >= 0', () => { enforce(model.entryFee).greaterThanOrEquals(0); });
  test('locker', 'locker must be >= 0', () => { enforce(model.locker).greaterThanOrEquals(0); });
  test('hallenTraining', 'hallenTraining must be >= 0', () => { enforce(model.hallenTraining).greaterThanOrEquals(0); });
  test('skiff', 'skiff must be >= 0', () => { enforce(model.skiff).greaterThanOrEquals(0); });
  test('skiffInsurance', 'skiffInsurance must be >= 0', () => { enforce(model.skiffInsurance).greaterThanOrEquals(0); });

  numberValidations('rebate', model.rebate, false, 0);

  test('state', 'state is required', () => { enforce(model.state).isNotEmpty(); });
});
