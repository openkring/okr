import { CategoryModel, GalleryEffect } from '@bk2/shared-models';

export type GalleryEffectCategory = CategoryModel;

export const GalleryEffects: GalleryEffectCategory[] = [
  {
    id: GalleryEffect.Slide,
    abbreviation: 'slide',
    name: 'slide',
    i18nBase: '@shared/categories.galleryEffect.slide',
    icon: 'albums'
  },
  {
    id: GalleryEffect.Fade,
    abbreviation: 'fade',
    name: 'fade',
    i18nBase: '@shared/categories.galleryEffect.fade',
    icon: 'shuffle-sort'
  },
  {
    id: GalleryEffect.Cube,
    abbreviation: 'cube',
    name: 'cube',
    i18nBase: '@shared/categories.galleryEffect.cube',
    icon: 'cube'
  },
  {
    id: GalleryEffect.Coverflow,
    abbreviation: 'cflow',
    name: 'coverflow',
    i18nBase: '@shared/categories.galleryEffect.coverflow',
    icon: 'stackoverflow_archive'
  },
  {
    id: GalleryEffect.Flip,
    abbreviation: 'flip',
    name: 'flip',
    i18nBase: '@shared/categories.galleryEffect.flip',
    icon: 'swap-horizontal'
  },
  {
    id: GalleryEffect.Creative,
    abbreviation: 'crtv',
    name: 'creative',
    i18nBase: '@shared/categories.galleryEffect.creative',
    icon: 'sparkles'
  },
  {
    id: GalleryEffect.Cards,
    abbreviation: 'cards',
    name: 'cards',
    i18nBase: '@shared/categories.galleryEffect.cards',
    icon: 'id-card'
  }
]
