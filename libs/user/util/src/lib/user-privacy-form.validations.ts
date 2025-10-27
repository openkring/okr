import { only, staticSuite } from 'vest';

import { PrivacyUsage } from '@bk2/shared-models';
import { categoryValidations } from '@bk2/shared-util-core';

import { UserPrivacyFormModel } from './user-privacy-form.model';

export const userPrivacyFormValidations = staticSuite((model: UserPrivacyFormModel, field?: string) => {
  only(field);

  categoryValidations('usageImages', model.usageImages, PrivacyUsage);
  categoryValidations('usageDateOfBirth', model.usageDateOfBirth, PrivacyUsage);
  categoryValidations('usagePostalAddress', model.usagePostalAddress, PrivacyUsage);
  categoryValidations('usagePhone', model.usagePhone, PrivacyUsage);
  categoryValidations('usageEmail', model.usageEmail, PrivacyUsage);
  categoryValidations('usageName', model.usageName, PrivacyUsage);
});

