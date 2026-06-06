import { ButtonAction, CategoryModel } from '@bk2/shared-models';

export type ButtonActionCategory = CategoryModel;

export const ButtonActions: ButtonActionCategory[] = [
  {
    id: ButtonAction.Download,
    abbreviation: 'DWNL',
    name: 'download',
    i18nBase: '@shared/categories.buttonAction.download',
    icon: 'download'
  },
  {
    id: ButtonAction.Navigate,
    abbreviation: 'NAV',
    name: 'navigate',
    i18nBase: '@shared/categories.buttonAction.navigate',
    icon: 'navigate'
  },
  {
    id: ButtonAction.Browse,
    abbreviation: 'BRSW',
    name: 'browse',
    i18nBase: '@shared/categories.buttonAction.browse',
    icon: 'link'
  },
  {
    id: ButtonAction.Zoom,
    abbreviation: 'ZOOM',
    name: 'zoom',
    i18nBase: '@shared/categories.buttonAction.zoom',
    icon: 'zoom'
  },
  {
    id: ButtonAction.None,
    abbreviation: 'NONE',
    name: 'none',
    i18nBase: '@shared/categories.buttonAction.none',
    icon: 'cancel'
  },
    {
    id: ButtonAction.Notify,
    abbreviation: 'NTFY',
    name: 'notify',
    i18nBase: '@shared/categories.buttonAction.notify',
    icon: 'info-circle'
  }
]
