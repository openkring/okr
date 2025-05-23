import { PrivacyUsage } from '@bk2/shared/models';
import { DeepPartial, DeepRequired} from 'ngx-vest-forms';

// privacy restriction attributes are from UserModel
export type PrivacyFormModel = DeepPartial<{
  usage_images: PrivacyUsage,
  usage_dateOfBirth: PrivacyUsage,
  usage_postalAddress: PrivacyUsage,
  usage_email: PrivacyUsage,
  usage_phone: PrivacyUsage,
  usage_name: PrivacyUsage
}>;

export const privacyFormModelShape: DeepRequired<PrivacyFormModel> = {
  usage_images: PrivacyUsage.None,
  usage_dateOfBirth: PrivacyUsage.Registered,
  usage_postalAddress: PrivacyUsage.Registered,
  usage_email: PrivacyUsage.Registered,
  usage_phone: PrivacyUsage.Registered,
  usage_name: PrivacyUsage.Registered
};