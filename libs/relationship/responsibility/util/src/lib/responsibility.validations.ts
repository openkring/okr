import { enforce, omitWhen, staticSuite, test } from 'vest';

import { EMAIL_LENGTH } from '@okr/shared-constants';

import { ResponsibilityModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, stringValidations } from '@okr/shared-util-core';

export const responsibilityValidations = staticSuite((model: ResponsibilityModel, tenants: string) => {
  baseValidations(model, tenants, '');

  avatarValidations('responsibleAvatar', model.responsibleAvatar);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

  // public role address (club alias); optional, missing on responsibilities saved before 2026-11-10
  omitWhen(model.email === undefined, () => {
    stringValidations('email', model.email, EMAIL_LENGTH);
  });
  omitWhen(!model.email, () => {
    test('email', 'invalidValue', () => {
      enforce(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(model.email ?? '')).isTruthy();
    });
  });

  if (model.delegateAvatar) {
    avatarValidations('delegateAvatar', model.delegateAvatar);
    dateValidations('delegateValidFrom', model.delegateValidFrom);
    dateValidations('delegateValidTo', model.delegateValidTo);
  }
});
