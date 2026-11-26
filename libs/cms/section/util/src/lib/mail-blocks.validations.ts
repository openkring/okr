import { enforce, test } from 'vest';

import { MAIL_BLOCK_TYPES, SECTION_CTA_STYLES, type MailBlock, type MailBlockType } from '@okr/shared-models';
import { MAX_MAIL_EVENTS, isMailPictureSource, isMailTextPicture, isSafeLinkTarget } from '@okr/shared-util-core';

import { BLOCK_ALIGNS, CALLOUT_TONES, COLUMN_BLOCK_TYPES, SPACE_SIZES, hasImageUrl, isObject, type Loose } from './article-block.util';
import { ARTICLE_BLOCKS_MAX } from './article-blocks.validations';
import { areColumns, check, checkImage, checkImageStyle, checkOneOf, columnLists, haveOwnIds } from './block-checks';
import { isMailTarget, textPictures } from './mail-block-parts';

/** Without a value the block is incomplete. */
function checkRequired(field: string, ok: boolean): void {
  test(field, 'required', () => {
    enforce(ok).isTruthy();
  });
}

const isText = (value: unknown): value is string => typeof value === 'string';
const isFilled = (value: unknown): boolean => isText(value) && value.trim() !== '';

/** A mail opens pages of the app, too. */
const LINK_MESSAGE = '@cms/section/feature.validation.mailImageLink';
/** A picture inside a text that the mail would replace by its alt text, or leave out (a tracking picture): the error of the text's html. */
export const MAIL_TEXT_PICTURE_MESSAGE = '@cms/section/feature.validation.mailTextPicture';

/** The html of a text or callout: a text, whose pictures the mail shows all (`isMailTextPicture`, the server's rule). */
function checkTextHtml(field: string, html: unknown): void {
  check(field, isText(html));
  test(field, MAIL_TEXT_PICTURE_MESSAGE, () => {
    enforce(textPictures(html).every(isMailTextPicture)).isTruthy();
  });
}

function checkPicture(field: string, image: unknown): void {
  checkImage(field, image, LINK_MESSAGE);
  if (!isObject(image)) return;
  if (hasImageUrl(image)) check(`${field}.url`, isMailPictureSource(image['url']));
  // an unsafe link has its error from checkImage; any other that a mail cannot open would be lost silently
  if (isFilled(image['actionUrl']) && isSafeLinkTarget(image['actionUrl'])) {
    test(`${field}.actionUrl`, LINK_MESSAGE, () => {
      enforce(isMailTarget(image['actionUrl'])).isTruthy();
    });
  }
}

/** What a click does and how far it zooms are no settings of a mail: stored ones are ignored, so they are no error either. */
function checkMailImageStyle(field: string, style: unknown): void {
  checkImageStyle(field, isObject(style) ? Object.fromEntries(Object.entries(style).filter(([name]) => name !== 'action' && name !== 'zoomFactor')) : style);
}

function checkContent(type: MailBlockType, block: Loose, f: (name: string) => string): void {
  switch (type) {
    case 'text':
      checkTextHtml(f('html'), block['html']);
      checkOneOf(f('align'), block['align'], BLOCK_ALIGNS);
      break;
    case 'callout':
      checkTextHtml(f('html'), block['html']);
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
      check(f('cta.url'), isMailTarget(cta['url']));
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
      check(f('maxEvents'), Number.isInteger(max) && (max as number) >= 1 && (max as number) <= MAX_MAIL_EVENTS);
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
