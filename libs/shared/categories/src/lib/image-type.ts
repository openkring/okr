import { CategoryModel, ImageType } from '@bk2/shared-models';

export type ImageTypeCategory = CategoryModel;

export const ImageTypes: ImageTypeCategory[] = [
  {
    id: ImageType.Image,
    abbreviation: 'IMG',
    name: 'image',
    i18nBase: '@shared/categories.imageType.image',
    icon: 'image'
  },
  {
    id: ImageType.Video,
    abbreviation: 'VID',
    name: 'video',
    i18nBase: '@shared/categories.imageType.video',
    icon: 'video'
  },
  {
    id: ImageType.StreamingVideo,
    abbreviation: 'SVID',
    name: 'streamingvideo',
    i18nBase: '@shared/categories.imageType.streamingvideo',
    icon: 'video'
  },
  {
    id: ImageType.Audio,
    abbreviation: 'AUD',
    name: 'audio',
    i18nBase: '@shared/categories.imageType.audio',
    icon: 'music'
  },
  {
    id: ImageType.Pdf,
    abbreviation: 'PDF',
    name: 'pdf',
    i18nBase: '@shared/categories.imageType.pdf',
    icon: 'document_text'
  },
  {
    id: ImageType.Doc,
    abbreviation: 'DOC',
    name: 'doc',
    i18nBase: '@shared/categories.imageType.doc',
    icon: 'document'
  },
  {
    id: ImageType.Dir,
    abbreviation: 'DIR',
    name: 'dir',
    i18nBase: '@shared/categories.imageType.dir',
    icon: 'folder'
  },
  {
    id: ImageType.Other,
    abbreviation: 'OTHR',
    name: 'other',
    i18nBase: '@shared/categories.imageType.other',
    icon: 'other'
  }
]
