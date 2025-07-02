import { only, staticSuite} from 'vest';
import { UserPrivacyFormModel } from './user-privacy-form.model';
import { categoryValidations } from '@bk2/shared/util-core';
import { PrivacyUsage } from '@bk2/shared/models';

export const userPrivacyFormValidations = staticSuite((model: UserPrivacyFormModel, field?: string) => {
  only(field);

  categoryValidations('usage_images', model.usage_images, PrivacyUsage);
  categoryValidations('usage_dateOfBirth', model.usage_dateOfBirth, PrivacyUsage);
  categoryValidations('usage_postalAddress', model.usage_postalAddress, PrivacyUsage);
  categoryValidations('usage_phone', model.usage_phone, PrivacyUsage);
  categoryValidations('usage_email', model.usage_email, PrivacyUsage);
  categoryValidations('usage_name', model.usage_name, PrivacyUsage);
});

