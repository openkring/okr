import { CategoryModel, PrivacyUsage } from "@bk2/shared/models";

export type PrivacyUsageCategory = CategoryModel;

export const PrivacyUsages: PrivacyUsageCategory[] = [
  {
    id: PrivacyUsage.None,
    abbreviation: 'NONE',
    name: 'none',
    i18nBase: 'auth.privacyUsage.none',
    icon: 'close_cancel'
  },
  {
      id: PrivacyUsage.Registered,
      abbreviation: 'REG',
      name: 'registered',
      i18nBase: 'auth.privacyUsage.registered',
      icon: 'person'
  },
  {
      id: PrivacyUsage.Privileged,
      abbreviation: 'PRIV',
      name: 'privileged',
      i18nBase: 'auth.privacyUsage.privileged',
      icon: 'person-add'
  }
]