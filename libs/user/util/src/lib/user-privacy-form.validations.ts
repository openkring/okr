import { staticSuite } from 'vest';

import { PrivacyUsage } from '@okr/shared-models';
import { categoryValidations } from '@okr/shared-util-core';

import { UserPrivacyFormModel } from './user-privacy-form.model';

export const userPrivacyFormValidations = staticSuite((model: UserPrivacyFormModel) => {
  categoryValidations('usageImages', model.usageImages, PrivacyUsage);
  categoryValidations('usageDateOfBirth', model.usageDateOfBirth, PrivacyUsage);
  categoryValidations('usagePostalAddress', model.usagePostalAddress, PrivacyUsage);
  categoryValidations('usagePhone', model.usagePhone, PrivacyUsage);
  categoryValidations('usageEmail', model.usageEmail, PrivacyUsage);
  categoryValidations('usageName', model.usageName, PrivacyUsage);
});

