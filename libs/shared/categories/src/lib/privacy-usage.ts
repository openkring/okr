import { CategoryModel, PrivacyUsage } from '@bk2/shared-models';

export type PrivacyUsageCategory = CategoryModel;

export const PrivacyUsages: PrivacyUsageCategory[] = [
  {
    id: PrivacyUsage.Public,
    abbreviation: 'PUBLIC',
    name: 'public',
    i18nBase: 'auth.privacyUsage.public',
    icon: 'eye-on'
  },
  {
      id: PrivacyUsage.Restricted,
      abbreviation: 'RESTR',
      name: 'restricted',
      i18nBase: 'auth.privacyUsage.restricted',
      icon: 'shield-checkmark'
  },
  {
      id: PrivacyUsage.Protected,
      abbreviation: 'PROT',
      name: 'protected',
      i18nBase: 'auth.privacyUsage.protected',
      icon: 'eye-off'
  }
]