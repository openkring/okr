import { CategoryModel, ColorIonic } from '@bk2/shared-models';

export type ColorIonicCategory = CategoryModel;

export const ColorsIonic: ColorIonicCategory[] = [   
  {
      id: ColorIonic.Primary,
      abbreviation: 'PRIM',
      name: 'primary',
      i18nBase: 'categories.color.ionic.primary',
      icon: 'color-palette'
  },
  {
      id: ColorIonic.Secondary,
      abbreviation: 'SEC',
      name: 'secondary',
      i18nBase: 'categories.color.ionic.secondary',
      icon: 'color-palette'
  },    {
      id: ColorIonic.Tertiary,
      abbreviation: 'THRD',
      name: 'tertiary',
      i18nBase: 'categories.color.ionic.tertiary',
      icon: 'color-palette'
  },    {
      id: ColorIonic.Success,
      abbreviation: 'SCCS',
      name: 'success',
      i18nBase: 'categories.color.ionic.success',
      icon: 'color-palette'
  },    {
      id: ColorIonic.Warning,
      abbreviation: 'WRN',
      name: 'warning',
      i18nBase: 'categories.color.ionic.warning',
      icon: 'color-palette'
  },    {
      id: ColorIonic.Danger,
      abbreviation: 'DGR',
      name: 'danger',
      i18nBase: 'categories.color.ionic.danger',
      icon: 'color-palette'
  },    {
    id: ColorIonic.Light,
    abbreviation: 'LGTH',
    name: 'light',
    i18nBase: 'categories.color.ionic.light',
    icon: 'color-palette'
  }, {
    id: ColorIonic.Medium,
    abbreviation: 'MED',
    name: 'medium',
    i18nBase: 'categories.color.ionic.medium',
    icon: 'color-palette'
  }, {
    id: ColorIonic.Dark,
    abbreviation: 'DRK',
    name: 'dark',
    i18nBase: 'categories.color.ionic.dark',
    icon: 'color-palette'
  },
  {
    id: ColorIonic.White,
    abbreviation: 'WHT',
    name: 'white',
    i18nBase: 'categories.color.ionic.white',
    icon: 'color-palette'
  }
]
