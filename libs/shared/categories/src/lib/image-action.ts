import { CategoryModel, ImageActionType } from '@bk2/shared-models';

export type ImageActionCategory = CategoryModel;

export const ImageActions: ImageActionCategory[] = [
  {
    id: ImageActionType.Download,
    abbreviation: 'DWNL',
    name: 'download',
    i18nBase: '@shared/categories.imageAction.download',
    icon: 'download'
  },
  {
    id: ImageActionType.Zoom,
    abbreviation: 'ZOOM',
    name: 'zoom',
    i18nBase: '@shared/categories.imageAction.zoom',
    icon: 'zoom'
  },
  {
    id: ImageActionType.OpenSlider,
    abbreviation: 'OPSL',
    name: 'openslider',
    i18nBase: '@shared/categories.imageAction.openslider',
    icon: 'images'
  },
  {
    id: ImageActionType.OpenDirectory,
    abbreviation: 'OPDR',
    name: 'opendirectory',
    i18nBase: '@shared/categories.imageAction.opendirectory',
    icon: 'folder-open'
  },
  {
    id: ImageActionType.FollowLink,
    abbreviation: 'FOLL',
    name: 'followlink',
    i18nBase: '@shared/categories.imageAction.followlink',
    icon: 'link'
  },
  {
    id: ImageActionType.None,
    abbreviation: 'NONE',
    name: 'none',
    i18nBase: '@shared/categories.imageAction.none',
    icon: 'cancel'
  }
]
