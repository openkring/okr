import { AvatarUsage, CategoryModel } from '@bk2/shared-models';

export type AvatarUsageCategory = CategoryModel;

export const AvatarUsages: AvatarUsageCategory[] = [
  {
    id: AvatarUsage.None,
    abbreviation: 'NONE',
    name: 'none',
    i18nBase: 'categories.avatarUsage.none',
    icon: 'eye-off'
  },
  {
    id: AvatarUsage.GravatarFirst,
    abbreviation: 'GRAV',
    name: 'gravatarFirst',
    i18nBase: 'categories.avatarUsage.gravatarFirst',
    icon: 'gravatar'
  },
  {
    id: AvatarUsage.NoGravatar,
    abbreviation: 'NOGRAV',
    name: 'noGravatar',
    i18nBase: 'categories.avatarUsage.noGravatar',
    icon: 'gravatar-no'
  },
  {
    id: AvatarUsage.PhotoFirst,
    abbreviation: 'PHOTO',
    name: 'photoFirst',
    i18nBase: 'categories.avatarUsage.photoFirst',
    icon: 'camera'
  }
]
