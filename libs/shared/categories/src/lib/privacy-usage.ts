import { CategoryModel, PrivacyUsage } from '@bk2/shared-models';

export type PrivacyUsageCategory = CategoryModel;

export const PrivacyUsages: PrivacyUsageCategory[] = [
  {
    id: PrivacyUsage.Public,
    abbreviation: 'PUBLIC',
    name: 'public',
    i18nBase: '@shared/categories.privacyUsage.public',
    icon: 'eye-on'
  },
  {
      id: PrivacyUsage.Restricted,
      abbreviation: 'RESTR',
      name: 'restricted',
      i18nBase: '@shared/categories.privacyUsage.restricted',
      icon: 'shield'
  },
  {
      id: PrivacyUsage.Protected,
      abbreviation: 'PROT',
      name: 'protected',
      i18nBase: '@shared/categories.privacyUsage.protected',
      icon: 'eye-off'
  }
]