import { describe, expect, it } from 'vitest';
import { EMAIL_LENGTH } from '@okr/shared-constants';
import { UserModel } from '@okr/shared-models';

import { UserModelFormModel } from './user-model-form.model';
import { userModelFormValidations } from './user-model-form.validations';
import { userValidations } from './user.validations';

const emailOf = (length: number): string => 'a'.repeat(length - '@verein.ch'.length) + '@verein.ch';

describe('email length', () => {
  for (const field of ['loginEmail', 'gravatarEmail'] as const) {
    const formErrors = (value: string) => userModelFormValidations({ [field]: value } as unknown as UserModelFormModel).getErrors(field);
    const userErrors = (value: string) => userValidations(Object.assign(new UserModel('scs'), { [field]: value }), 'scs', '').getErrors(field);

    it(`${field} accepts an address of 100 characters`, () => {
      expect(EMAIL_LENGTH).toBe(100);
      expect(formErrors(emailOf(100))).toEqual([]);
      expect(userErrors(emailOf(100))).toEqual([]);
    });

    it(`${field} rejects a longer one`, () => {
      expect(formErrors(emailOf(101))).not.toEqual([]);
      expect(userErrors(emailOf(101))).not.toEqual([]);
    });
  }
});
