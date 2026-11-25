import {
  IMAGE_STYLE_SHAPE, ImageActionType,
  type CaptionPosition, type ImageStyle, type MailBlock,
} from '@okr/shared-models';
import { mailEventLimit, toPixelNumber, type MailEventLine } from '@okr/shared-util-core';

import { isObject } from './article-block.util';
import { mailTone } from './mail-block-parts';

export { mailTone as mailToneOf } from './mail-block-parts';

/**
 * What panel and canvas of the editor work out for a Versand mail (spec 1.176 §8.2). Pure: nothing is mutated and nothing throws on
 * malformed stored blocks. What a mail honours of a picture is decided by `render-mail-blocks.logic.ts` (functions): keep them equal.
 */

// ------------------------------------------------------- pictures -------------------------------------------------------

/** What the panel offers; another stored width stays. */
export const MAIL_IMAGE_WIDTHS: readonly string[] = ['100%', '75%', '50%', '25%'];
export const MAIL_CAPTION_POSITIONS = ['none', 'top', 'bottom'] as const satisfies readonly CaptionPosition[];
export type MailCaptionPosition = (typeof MAIL_CAPTION_POSITIONS)[number];

/** The width of the blocks in the seeded layouts, in px. */
const CONTENT_WIDTH = 440;

const styleOf = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {});
const isFilled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** The width of a picture as the mail draws it: a part of its place in percent, px, or (anything else) all of it. */
export function mailImageWidth(style: Partial<ImageStyle> | undefined): string {
  const stored = styleOf(style)['width'];
  const width = typeof stored === 'string' ? stored.trim() : '';
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(width);
  if (percent) return Number(percent[1]) < 100 && Math.round(CONTENT_WIDTH * Number(percent[1]) / 100) >= 1 ? width : '100%';
  const px = Math.round(toPixelNumber(width) ?? 0);
  return px >= 1 ? `${Math.min(px, CONTENT_WIDTH)}px` : '100%';
}

/** No caption without a position; over the picture is below it in a mail. */
export function mailCaptionPosition(style: Partial<ImageStyle> | undefined): MailCaptionPosition {
  const stored = styleOf(style)['captionPosition'];
  if (!isFilled(stored) || stored === 'none') return 'none';
  return stored === 'top' ? 'top' : 'bottom';
}

/** The style of a picture as a mail draws it: its width (not in a gallery) and where the caption stands; everything else stored is ignored. */
export function mailPictureStyle(style: Partial<ImageStyle> | undefined, type: 'image' | 'gallery' = 'image'): ImageStyle {
  return {
    ...IMAGE_STYLE_SHAPE, border: '', borderRadius: '0', action: ImageActionType.None,
    width: type === 'image' ? mailImageWidth(style) : '100%', captionPosition: mailCaptionPosition(style),
  };
}

/**
 * The block with the action of its pictures as their links decide it: a mail always follows a link, the Mitteilung in the app only with
 * this action. No other action is a setting of a mail. The same block when nothing changes.
 */
export function withMailLinks(block: MailBlock): MailBlock {
  if (block.type !== 'image' && block.type !== 'gallery') return block;
  const images: unknown = block.type === 'image' ? [block.image] : block.images;
  const isLinked = Array.isArray(images) && images.some((image) => isObject(image) && isFilled(image['actionUrl']));
  const { action, ...others } = styleOf(block.imageStyle);
  const next = isLinked ? ImageActionType.FollowLink : undefined;
  if (action === next) return block;
  const style = next === undefined ? others : { ...others, action: next };
  const changed: MailBlock = { ...block, imageStyle: style };
  if (Object.keys(style).length === 0) delete changed.imageStyle;
  return changed;
}

// ------------------------------------------------------- the canvas -------------------------------------------------------

const drawnBlocks = new WeakMap<MailBlock, MailBlock>();

/** The block with what a mail ignores taken out, for drawing only; the same object for the same block, as the view cache needs it. */
export function drawnMailBlock(block: MailBlock): MailBlock {
  if (block.type !== 'callout' && block.type !== 'image') return block;
  let drawn = drawnBlocks.get(block);
  if (!drawn) {
    drawn = block.type === 'callout' ? { ...block, tone: mailTone(block.tone) } : { ...block, imageStyle: mailPictureStyle(block.imageStyle) };
    drawnBlocks.set(block, drawn);
  }
  return drawn;
}

/** The lines of an events block as of now; `lines` per calendar. */
export function mailEventsDrawn(block: MailBlock, lines: Record<string, MailEventLine[]>): MailEventLine[] {
  return block.type === 'events' ? (linesOf(block.calendarKey, lines) ?? []).slice(0, mailEventLimit(block)) : [];
}

/** Why an events block shows no lines: no calendar chosen, not loaded yet, or nothing coming up. */
export function eventsNote(block: MailBlock, lines: Record<string, MailEventLine[]>): 'choose' | 'later' | 'none' | undefined {
  if (block.type !== 'events' || !isFilled(block.calendarKey)) return 'choose';
  const known = linesOf(block.calendarKey, lines);
  if (!known) return 'later';
  return known.length === 0 ? 'none' : undefined;
}

function linesOf(calendarKey: unknown, lines: Record<string, MailEventLine[]>): MailEventLine[] | undefined {
  const key = typeof calendarKey === 'string' ? calendarKey.trim() : '';
  return key !== '' && Object.prototype.hasOwnProperty.call(lines, key) ? lines[key] : undefined;
}
