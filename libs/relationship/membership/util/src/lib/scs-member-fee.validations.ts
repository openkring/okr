import { enforce, only, staticSuite, test } from 'vest';

import { ScsMemberFeesModel } from '@bk2/shared-models';
import { baseValidations, numberValidations } from '@bk2/shared-util-core';

export const scsMemberFeeValidations = staticSuite((model: ScsMemberFeesModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);

  test('jb', 'tooSmall', () => { enforce(model.jb).greaterThanOrEquals(0); });
  test('srv', 'tooSmall', () => { enforce(model.srv).greaterThanOrEquals(0); });
  test('bev', 'tooSmall', () => { enforce(model.bev).greaterThanOrEquals(0); });
  test('entryFee', 'tooSmall', () => { enforce(model.entryFee).greaterThanOrEquals(0); });
  test('locker', 'tooSmall', () => { enforce(model.locker).greaterThanOrEquals(0); });
  test('hallenTraining', 'tooSmall', () => { enforce(model.hallenTraining).greaterThanOrEquals(0); });
  test('skiff', 'tooSmall', () => { enforce(model.skiff).greaterThanOrEquals(0); });
  test('skiffInsurance', 'tooSmall', () => { enforce(model.skiffInsurance).greaterThanOrEquals(0); });

  numberValidations('rebate', model.rebate, false, 0);

  test('state', 'required', () => { enforce(model.state).isNotEmpty(); });
});
