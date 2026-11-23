import { enforce, test } from 'vest';

import { ARTICLE_BLOCK_TYPES, ArticleConfig, ImageConfig, SECTION_CTA_STYLES, SLIDESHOW_EFFECTS } from '@okr/shared-models';
import { resolveImageStyle } from '@okr/shared-util-core';

import { BLOCK_ALIGNS, CALLOUT_TONES, COLUMN_BLOCK_TYPES, SPACE_SIZES, hasVisibleText, isObject } from './article-block.util';
import { imageConfigValidations, imageStyleValidations } from './image.validations';
import { isImageLayoutId } from './image-layout.util';
import { isSectionCtaUrl } from './section-cta.util';
import { SLIDESHOW_DURATION_MAX, SLIDESHOW_DURATION_MIN, SLIDESHOW_INTERVAL_MAX, SLIDESHOW_INTERVAL_MIN } from './slideshow.util';

/** At most this many top-level blocks per article (spec 1.173 §10). */
export const ARTICLE_BLOCKS_MAX = 50;

function check(field: string, ok: boolean): void {
  test(field, 'invalidValue', () => {
    enforce(ok).isTruthy();
  });
}

/** An optional enumerated value: absent is fine, a present one must be known. */
function checkOneOf(field: string, value: unknown, allowed: readonly string[]): void {
  check(field, value === undefined || (typeof value === 'string' && allowed.includes(value)));
}

function checkImage(field: string, image: unknown): void {
  if (isObject(image)) imageConfigValidations(field, image as unknown as ImageConfig);
  else check(`${field}.url`, false);
}

/** An optional partial image style: a non-object is an error, an object is checked on top of the defaults. */
function checkImageStyle(field: string, style: unknown): void {
  if (style === undefined) return;
  if (!isObject(style)) check(field, false);
  else imageStyleValidations(resolveImageStyle(style), `${field}.`);
}

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

/** The ids of all blocks, the ones inside columns included. */
function collectIds(blocks: unknown[], ids: unknown[]): void {
  for (const block of blocks) {
    if (!isObject(block)) continue;
    ids.push(block['id']);
    if (block['type'] === 'columns' && Array.isArray(block['columns'])) {
      for (const column of block['columns']) {
        if (isObject(column) && Array.isArray(column['blocks'])) collectIds(column['blocks'], ids);
      }
    }
  }
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
      checkImageStyle(f('imageStyle'), block['imageStyle']);
      break;
    case 'gallery': {
      const images = block['images'];
      if (!Array.isArray(images) || images.length === 0) check(f('images'), false);
      else images.forEach((image, i) => checkImage(f(`images[${i}]`), image));
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
      const columns = block['columns'];
      const list = Array.isArray(columns) ? columns : [];
      const sizes = list.map((c) => (isObject(c) ? c['size'] : undefined));
      check(f('columns'), Array.isArray(columns) && !inColumn && (list.length === 2 || list.length === 3)
        && list.every((c) => isObject(c) && Array.isArray(c['blocks']))
        && sizes.every((s) => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 11)
        && sizes.reduce<number>((sum, s) => sum + (typeof s === 'number' ? s : 0), 0) === 12);
      // the content is checked with the same rules; a nested `columns` is flagged there
      for (const column of list) {
        if (isObject(column) && Array.isArray(column['blocks'])) {
          column['blocks'].forEach((inner, i) => checkBlock(inner, i, true));
        }
      }
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

  const ids: unknown[] = [];
  collectIds(blocks, ids);
  check('blocks', ids.every((id) => typeof id === 'string' && id !== '') && new Set(ids).size === ids.length);

  blocks.forEach((block, index) => checkBlock(block, index, false));

  const cover: unknown = properties?.cover;
  if (cover !== undefined && cover !== null) checkImage('cover', cover);
}
