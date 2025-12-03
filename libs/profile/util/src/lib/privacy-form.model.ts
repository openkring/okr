import { PrivacyUsage } from '@bk2/shared-models';

// privacy restriction attributes are from UserModel
export type PrivacyFormModel = {
  usageImages: PrivacyUsage,
  usageDateOfBirth: PrivacyUsage,
  usagePostalAddress: PrivacyUsage,
  usageEmail: PrivacyUsage,
  usagePhone: PrivacyUsage,
  usageName: PrivacyUsage,
  srvEmail: boolean,
};

export const PRIVACY_FORM_SHAPE: PrivacyFormModel = {
  usageImages: PrivacyUsage.Public,
  usageDateOfBirth: PrivacyUsage.Restricted,
  usagePostalAddress: PrivacyUsage.Restricted,
  usageEmail: PrivacyUsage.Restricted,
  usagePhone: PrivacyUsage.Restricted,
  usageName: PrivacyUsage.Restricted,
  srvEmail: true
};