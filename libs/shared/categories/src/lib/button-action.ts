import { ButtonAction, CategoryModel } from '@bk2/shared-models';

export type ButtonActionCategory = CategoryModel;

export const ButtonActions: ButtonActionCategory[] = [
  {
    id: ButtonAction.Download,
    abbreviation: 'DWNL',
    name: 'download',
    i18nBase: 'categories.buttonAction.download',
    icon: 'download'
  },
  {
    id: ButtonAction.Navigate,
    abbreviation: 'NAV',
    name: 'navigate',
    i18nBase: 'categories.buttonAction.navigate',
    icon: 'navigate'
  },
  {
    id: ButtonAction.Browse,
    abbreviation: 'BRSW',
    name: 'browse',
    i18nBase: 'categories.buttonAction.browse',
    icon: 'link'
  },
  {
    id: ButtonAction.Zoom,
    abbreviation: 'ZOOM',
    name: 'zoom',
    i18nBase: 'categories.buttonAction.zoom',
    icon: 'move_zoom'
  },
  {
    id: ButtonAction.None,
    abbreviation: 'NONE',
    name: 'none',
    i18nBase: 'categories.buttonAction.none',
    icon: 'close_cancel'
  }
]
