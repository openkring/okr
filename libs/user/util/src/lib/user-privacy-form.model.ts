import { DeepRequired } from 'ngx-vest-forms';

import { PrivacyUsage } from '@bk2/shared-models';

export type UserPrivacyFormModel = {
  usage_images: PrivacyUsage,
  usage_dateOfBirth: PrivacyUsage,
  usage_postalAddress: PrivacyUsage,
  usage_email: PrivacyUsage,
  usage_phone: PrivacyUsage,
  usage_name: PrivacyUsage 
};


export const userPrivacyFormModelShape: DeepRequired<UserPrivacyFormModel> = {
  usage_images: PrivacyUsage.Public,          
  usage_dateOfBirth: PrivacyUsage.Restricted,
  usage_postalAddress: PrivacyUsage.Restricted,
  usage_email: PrivacyUsage.Restricted,
  usage_phone: PrivacyUsage.Restricted,
  usage_name: PrivacyUsage.Restricted
};