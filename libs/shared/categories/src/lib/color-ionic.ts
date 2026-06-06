import { CategoryModel, ColorIonic } from '@bk2/shared-models';

export type ColorIonicCategory = CategoryModel;

export const ColorsIonic: ColorIonicCategory[] = [   
  {
      id: ColorIonic.Primary,
      abbreviation: 'PRIM',
      name: 'primary',
      i18nBase: '@shared/categories.color.ionic.primary',
      icon: 'color'
  },
  {
      id: ColorIonic.Secondary,
      abbreviation: 'SEC',
      name: 'secondary',
      i18nBase: '@shared/categories.color.ionic.secondary',
      icon: 'color'
  },    {
      id: ColorIonic.Tertiary,
      abbreviation: 'THRD',
      name: 'tertiary',
      i18nBase: '@shared/categories.color.ionic.tertiary',
      icon: 'color'
  },    {
      id: ColorIonic.Success,
      abbreviation: 'SCCS',
      name: 'success',
      i18nBase: '@shared/categories.color.ionic.success',
      icon: 'color'
  },    {
      id: ColorIonic.Warning,
      abbreviation: 'WRN',
      name: 'warning',
      i18nBase: '@shared/categories.color.ionic.warning',
      icon: 'color'
  },    {
      id: ColorIonic.Danger,
      abbreviation: 'DGR',
      name: 'danger',
      i18nBase: '@shared/categories.color.ionic.danger',
      icon: 'color'
  },    {
    id: ColorIonic.Light,
    abbreviation: 'LGTH',
    name: 'light',
    i18nBase: '@shared/categories.color.ionic.light',
    icon: 'color'
  }, {
    id: ColorIonic.Medium,
    abbreviation: 'MED',
    name: 'medium',
    i18nBase: '@shared/categories.color.ionic.medium',
    icon: 'color'
  }, {
    id: ColorIonic.Dark,
    abbreviation: 'DRK',
    name: 'dark',
    i18nBase: '@shared/categories.color.ionic.dark',
    icon: 'color'
  },
  {
    id: ColorIonic.White,
    abbreviation: 'WHT',
    name: 'white',
    i18nBase: '@shared/categories.color.ionic.white',
    icon: 'color'
  }
]
