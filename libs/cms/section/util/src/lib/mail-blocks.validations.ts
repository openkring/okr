import { enforce, test } from 'vest';

import { MAIL_BLOCK_TYPES, SECTION_CTA_STYLES, type MailBlock, type MailBlockType } from '@okr/shared-models';
import { mailTargetUrl } from '@okr/shared-util-core';

import { BLOCK_ALIGNS, CALLOUT_TONES, COLUMN_BLOCK_TYPES, SPACE_SIZES, hasImageUrl, isObject, type Loose } from './article-block.util';
import { ARTICLE_BLOCKS_MAX } from './article-blocks.validations';
import { areColumns, check, checkImage, checkImageStyle, checkOneOf, columnLists, haveOwnIds } from './block-checks';
import { MAIL_EVENTS_MAX } from './mail-block-parts';

/** Without a value the block is incomplete. */
function checkRequired(field: string, ok: boolean): void {
  test(field, 'required', () => {
    enforce(ok).isTruthy();
  });
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isFilled = (value: unknown): boolean => isText(value) && value.trim() !== '';

/**
 * A picture address that the mail can show: the rule of the server's `storedPictureUrl` (functions, mail-picture.logic.ts,
 * which an app cannot import).
 */
function isMailPictureUrl(raw: unknown): boolean {
  const url = isText(raw) ? raw.trim() : '';
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (url === '' || url.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(url)) return false;
  try {
    encodeURIComponent(url);
  } catch {
    return false;    // no valid unicode
  }
  return !/^[a-z][a-z\d+.-]*:/i.test(url) || /^https:\/\/[^\s/?#]/i.test(url);
}

function checkPicture(field: string, image: unknown): void {
  checkImage(field, image);
  if (hasImageUrl(image)) check(`${field}.url`, isMailPictureUrl((image as Loose)['url']));
}

/** What a click does and how far it zooms are no settings of a mail: stored ones are ignored, so they are no error either. */
function checkMailImageStyle(field: string, style: unknown): void {
  checkImageStyle(field, isObject(style) ? Object.fromEntries(Object.entries(style).filter(([name]) => name !== 'action' && name !== 'zoomFactor')) : style);
}

function checkContent(type: MailBlockType, block: Loose, f: (name: string) => string): void {
  switch (type) {
    case 'text':
      check(f('html'), isText(block['html']));
      checkOneOf(f('align'), block['align'], BLOCK_ALIGNS);
      break;
    case 'callout':
      check(f('html'), isText(block['html']));
      check(f('tone'), (CALLOUT_TONES as readonly unknown[]).includes(block['tone']));
      break;
    case 'image':
      checkPicture(f('image'), block['image']);
      checkRequired(f('image.url'), hasImageUrl(block['image']));
      checkMailImageStyle(f('imageStyle'), block['imageStyle']);
      break;
    case 'gallery': {
      const images = Array.isArray(block['images']) ? block['images'] : [];
      checkRequired(f('images'), images.some(hasImageUrl));
      images.forEach((image, i) => checkPicture(f(`images[${i}]`), image));
      checkMailImageStyle(f('imageStyle'), block['imageStyle']);
      break;
    }
    case 'button': {
      const cta = isObject(block['cta']) ? block['cta'] : {};
      check(f('cta.label'), isFilled(cta['label']));
      // a website page or an anchor means nothing in a mail; any origin will do, only the form counts
      check(f('cta.url'), mailTargetUrl(cta['url'], 'https://app') !== '');
      checkOneOf(f('cta.style'), cta['style'], SECTION_CTA_STYLES);
      checkOneOf(f('align'), block['align'], BLOCK_ALIGNS);
      break;
    }
    case 'space':
      check(f('size'), (SPACE_SIZES as readonly unknown[]).includes(block['size']));
      break;
    case 'events': {
      const max = block['maxEvents'];
      checkRequired(f('calendarKey'), isFilled(block['calendarKey']));
      check(f('title'), block['title'] === undefined || isText(block['title']));
      check(f('maxEvents'), Number.isInteger(max) && (max as number) >= 1 && (max as number) <= MAIL_EVENTS_MAX);
      break;
    }
    case 'columns':
      check(f('columns'), areColumns(block['columns']));
      columnLists(block['columns']).forEach((list) => list.forEach((inner, i) => checkBlock(inner, i, true)));
      break;
    case 'divider':
      break;
  }
}

function checkBlock(block: unknown, index: number, inColumn: boolean): void {
  if (!isObject(block)) {
    check('blocks', false);
    return;
  }
  const id = isText(block['id']) && block['id'] !== '' ? block['id'] : `[${index}]`;
  const type = block['type'];
  // an article tolerates a type that this app does not know; a mail with it would be refused at sending
  const isKnown = (MAIL_BLOCK_TYPES as readonly unknown[]).includes(type);
  check(`blocks.${id}.type`, isKnown && (!inColumn || COLUMN_BLOCK_TYPES.includes(type as string)));
  if (isKnown) checkContent(type as MailBlockType, block, (name) => `blocks.${id}.${name}`);
}

/**
 * Validates the blocks of a Versand mail (spec 1.176 §8.1), inside a suite; field names as in `articleBlocksValidations`.
 * Refuses everything that the server's renderer refuses (`checkBlocks` of render-mail-blocks.logic.ts), so a valid mail never
 * fails at sending for a block. Settings that a mail does not have (layout, slideshow, translations …) are not looked at: they
 * could not be corrected. Never throws on malformed stored data.
 */
export function mailBlocksValidations(blocks: MailBlock[]): void {
  const stored: unknown = blocks;
  check('blocks', Array.isArray(stored) && stored.length <= ARTICLE_BLOCKS_MAX);
  if (!Array.isArray(stored)) return;
  check('blocks', haveOwnIds(stored));
  stored.forEach((block, index) => checkBlock(block, index, false));
}
