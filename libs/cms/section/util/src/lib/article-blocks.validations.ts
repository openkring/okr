import { enforce, test } from 'vest';

import { ARTICLE_BLOCK_TYPES, ArticleConfig, SECTION_CTA_STYLES, SLIDESHOW_EFFECTS } from '@okr/shared-models';

import { BLOCK_ALIGNS, CALLOUT_TONES, COLUMN_BLOCK_TYPES, SPACE_SIZES, hasImageUrl, hasVisibleText, isObject } from './article-block.util';
import { areColumns, check, checkImage, checkImageStyle, checkOneOf, columnLists, haveOwnIds } from './block-checks';
import { isImageLayoutId } from './image-layout.util';
import { isSectionCtaUrl } from './section-cta.util';
import { SLIDESHOW_DURATION_MAX, SLIDESHOW_DURATION_MIN, SLIDESHOW_INTERVAL_MAX, SLIDESHOW_INTERVAL_MIN } from './slideshow.util';

/** At most this many top-level blocks per article (spec 1.173 §10). */
export const ARTICLE_BLOCKS_MAX = 50;

function checkSlideshow(field: string, slideshow: unknown): void {
  if (slideshow === undefined) return;
  const s = isObject(slideshow) ? slideshow : {};
  const inRange = (value: unknown, min: number, max: number) => typeof value === 'number' && value >= min && value <= max;
  check(field, isObject(slideshow)
    && (SLIDESHOW_EFFECTS as readonly string[]).includes(s['effect'] as string)
    && inRange(s['interval'], SLIDESHOW_INTERVAL_MIN, SLIDESHOW_INTERVAL_MAX)
    && inRange(s['duration'], SLIDESHOW_DURATION_MIN, SLIDESHOW_DURATION_MAX));
}

/** label and url each set, url a safe target, style known; a translated label needs the German one. */
function checkCta(field: string, cta: unknown): void {
  const c = isObject(cta) ? cta : {};
  const label = typeof c['label'] === 'string' ? c['label'].trim() : '';
  const url = typeof c['url'] === 'string' ? c['url'].trim() : '';
  check(`${field}.label`, isObject(cta) && label !== '');
  check(`${field}.url`, isObject(cta) && url !== '' && isSectionCtaUrl(url));
  checkOneOf(`${field}.style`, c['style'], SECTION_CTA_STYLES);
}

/** A text may be empty; but translations without German text are incomplete (the reader falls back to German). */
function checkHtml(field: string, block: Record<string, unknown>): void {
  const translations = isObject(block['htmlI18n']) ? block['htmlI18n'] : {};
  const translated = Object.entries(translations).some(([lang, value]) => lang !== 'de' && hasVisibleText(value));
  test(field, 'required', () => {
    enforce(!translated || hasVisibleText(block['html'])).isTruthy();
  });
}

function checkBlock(block: unknown, index: number, inColumn: boolean): void {
  if (!isObject(block)) {
    check('blocks', false);
    return;
  }
  const id = typeof block['id'] === 'string' && block['id'] !== '' ? block['id'] : `[${index}]`;
  const f = (name: string) => `blocks.${id}.${name}`;
  const type = block['type'];

  // a block of a type this app does not know (stored by a newer app) is shown as «Unbekannter Block», never validated
  if (typeof type !== 'string' || !(ARTICLE_BLOCK_TYPES as readonly string[]).includes(type)) return;
  check(f('type'), !inColumn || COLUMN_BLOCK_TYPES.includes(type));

  switch (type) {
    case 'text':
      checkOneOf(f('align'), block['align'], BLOCK_ALIGNS);
      checkHtml(f('html'), block);
      break;
    case 'callout':
      checkHtml(f('html'), block);
      check(f('tone'), typeof block['tone'] === 'string' && (CALLOUT_TONES as readonly string[]).includes(block['tone']));
      break;
    case 'image':
      checkImage(f('image'), block['image']);
      // without a picture readers see nothing: the block is incomplete (spec 1.175 §7.6)
      test(f('image.url'), 'required', () => {
        enforce(hasImageUrl(block['image'])).isTruthy();
      });
      checkImageStyle(f('imageStyle'), block['imageStyle']);
      break;
    case 'gallery': {
      const images = block['images'];
      test(f('images'), 'required', () => {
        enforce(Array.isArray(images) && images.some(hasImageUrl)).isTruthy();
      });
      if (Array.isArray(images)) images.forEach((image, i) => checkImage(f(`images[${i}]`), image));
      const layout = block['layout'];
      check(f('layout'), layout === undefined || isImageLayoutId(layout));
      checkImageStyle(f('imageStyle'), block['imageStyle']);
      checkSlideshow(f('slideshow'), block['slideshow']);
      break;
    }
    case 'button':
      checkOneOf(f('align'), block['align'], BLOCK_ALIGNS);
      checkCta(f('cta'), block['cta']);
      break;
    case 'space':
      check(f('size'), typeof block['size'] === 'string' && (SPACE_SIZES as readonly string[]).includes(block['size']));
      break;
    case 'columns': {
      check(f('columns'), !inColumn && areColumns(block['columns']));
      // the content is checked with the same rules; a nested `columns` is flagged there
      columnLists(block['columns']).forEach((list) => list.forEach((inner, i) => checkBlock(inner, i, true)));
      break;
    }
  }
}

/**
 * Validates the free blocks of an article (spec 1.173 §10) and its `cover`. Field names: `blocks` (count, ids),
 * `blocks.<id>.<field>` and `cover.*`. Never throws on malformed stored data. Text length is not capped: today's
 * editor has no cap either.
 */
export function articleBlocksValidations(properties: ArticleConfig | undefined): void {
  const blocks: unknown = properties?.blocks;
  if (!Array.isArray(blocks)) return;

  check('blocks', blocks.length <= ARTICLE_BLOCKS_MAX);

  check('blocks', haveOwnIds(blocks));

  blocks.forEach((block, index) => checkBlock(block, index, false));

  const cover: unknown = properties?.cover;
  if (cover !== undefined && cover !== null) checkImage('cover', cover);
}
