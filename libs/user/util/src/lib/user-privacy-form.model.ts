import { PrivacyUsage } from '@bk2/shared/models';
import { DeepRequired } from 'ngx-vest-forms';

export type UserPrivacyFormModel = {
  usage_images: PrivacyUsage,
  usage_dateOfBirth: PrivacyUsage,
  usage_postalAddress: PrivacyUsage,
  usage_email: PrivacyUsage,
  usage_phone: PrivacyUsage,
  usage_name: PrivacyUsage 
};


export const userPrivacyFormModelShape: DeepRequired<UserPrivacyFormModel> = {
  usage_images: PrivacyUsage.None,          
  usage_dateOfBirth: PrivacyUsage.Registered,
  usage_postalAddress: PrivacyUsage.Registered,
  usage_email: PrivacyUsage.Registered,
  usage_phone: PrivacyUsage.Registered,
  usage_name: PrivacyUsage.Registered
};