import { only, staticSuite } from 'vest';

import { PrivacyUsage } from '@bk2/shared-models';
import { categoryValidations } from '@bk2/shared-util-core';

import { PrivacyFormModel } from './privacy-form.model';

export const privacyFormValidations = staticSuite((model: PrivacyFormModel, field?: string) => {
  only(field);
  categoryValidations('usage_images', model.usage_images, PrivacyUsage);
  categoryValidations('usage_dateOfBirth', model.usage_dateOfBirth, PrivacyUsage);
  categoryValidations('usage_postalAddress', model.usage_postalAddress, PrivacyUsage);
  categoryValidations('usage_email', model.usage_email, PrivacyUsage);
  categoryValidations('usage_phone', model.usage_phone, PrivacyUsage);
  categoryValidations('usage_name', model.usage_name, PrivacyUsage);
});

