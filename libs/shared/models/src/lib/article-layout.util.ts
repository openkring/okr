import { ViewPosition } from './enums/view-position.enum';

/**
 * Image layouts of the CMS article section (spec 1.154 §5, phase-3 plan decisions 1, 2, 4, 6).
 * One id per layout shape, shared across image counts where the shape is the same. `slider` is today's carousel
 * (and the default when no layout is stored), so every existing article renders unchanged.
 * Everything else about layouts (groups, tiles) is in `@okr/cms-section-util`, which re-exports these names.
 */
export const IMAGE_LAYOUT_IDS = [
  'pair', 'big-small', 'stacked',
  'big-left', 'big-top', 'big-right', 'row',
  'grid', 'filmstrip',
  'mosaic', 'big-grid',
  'side-by-side',
  'slider',
] as const;
export type ImageLayoutId = (typeof IMAGE_LAYOUT_IDS)[number];

/**
 * `side-by-side`: the whole images (not cropped) next to each other in one centred row, each with its caption below
 * — e.g. the TWINT and PostFinance QR codes of a donation article. It is the one layout that also applies to a single
 * image (see `resolveImageLayout`), so a one-QR-code article looks like its two-code siblings.
 */
export const SIDE_BY_SIDE_LAYOUT: ImageLayoutId = 'side-by-side';

/**
 * `stacked` («Untereinander»): the whole images (not cropped, natural aspect) one below the other, each at the full
 * width of the article, for any number of images. Like `side-by-side` it is drawn as a plain column, not as grid tiles
 * (the tiles of `imageLayoutTiles` are only read by the picker's schematic preview).
 */
export const STACKED_LAYOUT: ImageLayoutId = 'stacked';

/**
 * Where the images of an article stand relative to its text (decision 6, spec §5):
 * 0 images → none; 1 image → the stored position (or none), any layout ignored but kept — except `side-by-side`, which
 * places a single image like several (top, or bottom when stored);
 * more images → top, or bottom when stored — but bottom only with a layout set, so an existing multi-image article
 * (always drawn on top today, whatever its stored position) does not move.
 */
export function articleImagePosition(position: ViewPosition | undefined, count: number, imageLayout: string | undefined): ViewPosition {
  if (count === 0) return ViewPosition.None;
  if (count === 1 && imageLayout !== SIDE_BY_SIDE_LAYOUT) return position ?? ViewPosition.None;
  return imageLayout && position === ViewPosition.Bottom ? ViewPosition.Bottom : ViewPosition.Top;
}
