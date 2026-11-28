import type { ArticleSection, GalleryBlock, SectionModel, SectionType } from '@okr/shared-models';
import { createSection } from './section.util';

/**
 * Entries of the section picker that are not section types but presets of one (spec 1.182 §5, §7). The picker lists
 * the categories of `section_type`; an entry named here creates the section of its preset.
 */
export const SLIDER_PRESET = 'slider';

/** The id of the gallery block a slider article starts with. */
export const SLIDER_GALLERY_ID = 'slider-gallery';

/** A new «Slider»: an article with one empty gallery block in the carousel layout. */
export function newSliderArticle(tenantId: string): ArticleSection {
  const article = createSection('article', tenantId) as ArticleSection;
  const gallery: GalleryBlock = { id: SLIDER_GALLERY_ID, type: 'gallery', images: [], layout: 'slider' };
  return { ...article, properties: { ...article.properties, images: [], blocks: [gallery] } };
}

/** The new section for an entry of the section picker: a preset, or a section of that type. */
export function createPickedSection(name: string, tenantId: string): SectionModel {
  return name === SLIDER_PRESET ? newSliderArticle(tenantId) : createSection(name as SectionType, tenantId);
}
