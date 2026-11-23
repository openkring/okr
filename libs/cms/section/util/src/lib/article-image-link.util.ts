import { SectionModel, articleBlocksOf, articleCover, blockImages } from '@okr/shared-models';

/**
 * Whether the section shows the image with this `url`. An article with blocks (spec 1.173): in its blocks or as its
 * cover, the old `images` next to them are ignored. Any other section: in `properties.images`.
 */
export function isImageLinked(section: SectionModel, url: string): boolean {
  const blocks = articleBlocksOf(section);
  if (blocks) return [articleCover(section), ...blockImages(blocks)].some((image) => image?.url === url);
  const images = (section.properties as { images?: unknown } | undefined)?.images;
  return Array.isArray(images) && images.some((image) => image?.url === url);
}
