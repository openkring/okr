import { only, staticSuite } from 'vest';

import { PrivacyUsage } from '@bk2/shared-models';
import { booleanValidations, categoryValidations } from '@bk2/shared-util-core';

import { PrivacyFormModel } from './privacy-form.model';

export const privacyFormValidations = staticSuite((model: PrivacyFormModel, field?: string) => {
  only(field);
  categoryValidations('usageImages', model.usageImages, PrivacyUsage);
  categoryValidations('usageDateOfBirth', model.usageDateOfBirth, PrivacyUsage);
  categoryValidations('usagePostalAddress', model.usagePostalAddress, PrivacyUsage);
  categoryValidations('usageEmail', model.usageEmail, PrivacyUsage);
  categoryValidations('usagePhone', model.usagePhone, PrivacyUsage);
  categoryValidations('usageName', model.usageName, PrivacyUsage);
  booleanValidations('srvEmail', model.srvEmail);
});

