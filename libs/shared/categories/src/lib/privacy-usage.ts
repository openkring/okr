import { CategoryItemModel, CategoryListModel, CategoryModel, PrivacyUsage } from '@okr/shared-models';

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

/**
 * The same three `PrivacyUsage` values, worded for **photos** (`usageImages`).
 *
 * `usageImages` is not an access control (D-P4-10): it records that a person objects to being
 * photographed or to having their picture published, addressed to the photographer and the
 * contentAdmin. The generic `PrivacyUsages` labels ("Öffentlich / Eingeschränkt / Geschützt")
 * describe who may *read a field*, which says nothing a member can act on when the subject is
 * their own photograph — hence this parallel list. Same ids, so the stored value is unchanged.
 */
export const PhotoUsages: PrivacyUsageCategory[] = [
  {
    id: PrivacyUsage.Public,
    abbreviation: 'PUBLIC',
    name: 'public',
    i18nBase: '@shared/categories.photoUsage.public',
    icon: 'eye-on'
  },
  {
    id: PrivacyUsage.Restricted,
    abbreviation: 'RESTR',
    name: 'restricted',
    i18nBase: '@shared/categories.photoUsage.restricted',
    icon: 'shield'
  },
  {
    id: PrivacyUsage.Protected,
    abbreviation: 'PROT',
    name: 'protected',
    i18nBase: '@shared/categories.photoUsage.protected',
    icon: 'eye-off'
  }
]

/**
 * The same three photo values as a `CategoryListModel`, for list filters (`okr-cat-select`).
 *
 * This is what makes the declaration **consultable**: without a filter, `usageImages` is
 * write-only — a member sets it in their profile and no photographer or contentAdmin can find
 * out. Labels resolve to `@shared/categories.photoUsage.<item>.label`, the same keys `PhotoUsages`
 * uses, so the filter and the profile always read alike.
 */
export function getPhotoUsageCategory(tenantId: string): CategoryListModel {
  const category = new CategoryListModel(tenantId);
  category.okey = 'photoUsage';
  category.name = 'photoUsage';
  category.i18n = '@shared/categories';
  category.translateItems = true;
  category.items = PhotoUsages.map(usage => new CategoryItemModel(usage.name, usage.icon, usage.abbreviation));
  return category;
}