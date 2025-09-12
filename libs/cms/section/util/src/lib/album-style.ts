import { AlbumStyle, CategoryModel } from "@bk2/shared-models";

export const DefaultAlbumStyle = AlbumStyle.Pinterest;

export type AlbumStyleCategory = CategoryModel;

export const AlbumStyles: AlbumStyleCategory[] = 
[
  {
    id: AlbumStyle.Grid,
    abbreviation: 'GRID',
    name: 'grid',
    i18nBase: 'categories.albumStyle.grid',
    icon: 'grid'
  },
  {
    id: AlbumStyle.Pinterest,
    abbreviation: 'PINT',
    name: 'pinterest',
    i18nBase: 'categories.albumStyle.pinterest',
    icon: 'pinterest'
  },
  {
    id: AlbumStyle.Imgix,
    abbreviation: 'IMGIX',
    name: 'imgix',
    i18nBase: 'categories.albumStyle.imgix',
    icon: 'image'
  },
  {
    id: AlbumStyle.List,
    abbreviation: 'LIST',
    name: 'list',
    i18nBase: 'categories.albumStyle.list',
    icon: 'menu'
  },
  {
    id: AlbumStyle.AvatarList,
    abbreviation: 'AVLI',
    name: 'avatarlist',
    i18nBase: 'categories.albumStyle.avatarlist',
    icon: 'list'
  }
]
