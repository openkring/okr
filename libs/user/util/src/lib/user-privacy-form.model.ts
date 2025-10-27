import { DeepRequired } from 'ngx-vest-forms';

import { PrivacyUsage } from '@bk2/shared-models';

export type UserPrivacyFormModel = {
  usageImages: PrivacyUsage,
  usageDateOfBirth: PrivacyUsage,
  usagePostalAddress: PrivacyUsage,
  usageEmail: PrivacyUsage,
  usagePhone: PrivacyUsage,
  usageName: PrivacyUsage,
  srvEmail: boolean;
};


export const userPrivacyFormModelShape: DeepRequired<UserPrivacyFormModel> = {
  usageImages: PrivacyUsage.Public,          
  usageDateOfBirth: PrivacyUsage.Restricted,
  usagePostalAddress: PrivacyUsage.Restricted,
  usageEmail: PrivacyUsage.Restricted,
  usagePhone: PrivacyUsage.Restricted,
  usageName: PrivacyUsage.Restricted,
  srvEmail: true
};