import type { ArticleSection, GalleryBlock, ImageStyle, SectionModel, SliderSection } from '@okr/shared-models';
import { compactImageStyle } from '@okr/shared-util-core';

/**
 * A slider is an article with one gallery block (spec 1.182 §3). The section editor opens a stored slider converted,
 * and the migration writes the same conversion, so both give the same article.
 */

/** The id of the gallery block a slider becomes: fixed, so that the editor and the migration write the same article. */
export const SLIDER_GALLERY_ID = 'slider-gallery';

/** What the slider's carousel set itself, whatever was stored: dropped, so that the gallery's carousel decides. */
const UNDRAWN_STYLE_FIELDS: readonly string[] = ['width', 'height', 'fill', 'sizes'];

/** The slider as an article: same id and section fields, its images and drawn style in one gallery block in the carousel layout. */
export function sliderToArticle(section: SliderSection): ArticleSection {
  const properties = (section.properties ?? {}) as Partial<SliderSection['properties']>;
  const images = Array.isArray(properties.images) ? properties.images : [];
  const stored = properties.imageStyle && typeof properties.imageStyle === 'object' ? properties.imageStyle : undefined;
  const drawn = stored ? Object.fromEntries(Object.entries(stored).filter(([key]) => !UNDRAWN_STYLE_FIELDS.includes(key))) as Partial<ImageStyle> : undefined;
  const imageStyle = compactImageStyle(drawn);
  const gallery: GalleryBlock = { id: SLIDER_GALLERY_ID, type: 'gallery', images, layout: 'slider', ...(imageStyle ? { imageStyle } : {}) };
  return { ...section, type: 'article', properties: { images: [], blocks: [gallery] } } as ArticleSection;
}

/** What an editor opens: a slider as its article (spec 1.182 §5); any other section as it is. */
export function asEditedSection(section: SectionModel): SectionModel {
  return section.type === 'slider' ? sliderToArticle(section) : section;
}
