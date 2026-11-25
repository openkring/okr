import {
  IMAGE_STYLE_SHAPE, ImageActionType,
  type CaptionPosition, type GalleryBlock, type ImageConfig, type ImageStyle, type MailBlock,
} from '@okr/shared-models';
import { buildImageCaption, isMailPictureSource, mailCaptionPosition, mailEventLimit, mailPictureWidth, type MailEventLine } from '@okr/shared-util-core';

import { isObject } from './article-block.util';
import type { EditorProfile } from './editor-profile';
import { mailTone, str } from './mail-block-parts';

export { mailTone as mailToneOf } from './mail-block-parts';

/**
 * What panel and canvas of the editor work out for a Versand mail (spec 1.176 §8.2). Pure: nothing is mutated and nothing throws on
 * malformed stored blocks. What a mail honours of a picture's style is decided in `mail-picture.util` (shared-util-core), for its renderer too.
 */

// ------------------------------------------------------- pictures -------------------------------------------------------

/** What the panel offers; another stored width stays. */
export const MAIL_IMAGE_WIDTHS: readonly string[] = ['100%', '75%', '50%', '25%'];
export const MAIL_CAPTION_POSITIONS = ['none', 'top', 'bottom'] as const satisfies readonly CaptionPosition[];
export type MailCaptionPosition = (typeof MAIL_CAPTION_POSITIONS)[number];

const styleOf = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {});
const isFilled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** The width of a picture as the mail draws it, as css. */
export function mailImageWidth(style: Partial<ImageStyle> | undefined): string {
  const width = mailPictureWidth(styleOf(style)['width']);
  return 'px' in width ? `${width.px}px` : `${width.percent}%`;
}

export function mailStyleCaptionPosition(style: Partial<ImageStyle> | undefined): MailCaptionPosition {
  return mailCaptionPosition(styleOf(style)['captionPosition']);
}

/** Whether a picture of the block has a caption or a credit that the mail does not show, because the style has no position for it. */
export function isMailCaptionHidden(block: MailBlock): boolean {
  if (block.type !== 'image' && block.type !== 'gallery') return false;
  const images: unknown = block.type === 'image' ? [block.image] : block.images;
  return mailStyleCaptionPosition(block.imageStyle) === 'none'
    && Array.isArray(images) && images.some((image) => isObject(image) && (isFilled(image['overlay']) || isFilled(image['credit'])));
}

/** The style of a picture as a mail draws it: its width (not in a gallery) and where the caption stands; everything else stored is ignored. */
export function mailPictureStyle(style: Partial<ImageStyle> | undefined, type: 'image' | 'gallery' = 'image'): ImageStyle {
  return {
    ...IMAGE_STYLE_SHAPE, border: '', borderRadius: '0', action: ImageActionType.None,
    width: type === 'image' ? mailImageWidth(style) : '100%', captionPosition: mailStyleCaptionPosition(style),
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

/** The block as the canvas of this profile draws it. */
export function drawnBlock(block: MailBlock, profile: EditorProfile): MailBlock {
  return profile.kind === 'mail' ? drawnMailBlock(block) : block;
}

/** A cell of a gallery: the picture, or (`text`) what a mail shows of one that has no address it can show, with its caption. */
export interface MailPictureCell { image: ImageConfig; text: string; above: string[]; below: string[] }

/** The cells of a gallery as the mail draws them; an entry in which nothing was entered is left out. */
export function mailPictureCells(block: GalleryBlock): MailPictureCell[] {
  const images: unknown[] = Array.isArray(block.images) ? block.images : [];
  const position = mailStyleCaptionPosition(block.imageStyle);
  return images.filter(isObject).flatMap((stored): MailPictureCell[] => {
    const image = stored as unknown as ImageConfig;
    const alt = str(stored['altText']) || str(stored['label']);
    if (str(stored['url']) === '' && alt === '') return [];
    // without an alt text there is an error to fix: the author sees the picture that is meant
    const text = isMailPictureSource(stored['url']) ? '' : alt;
    if (text === '' || position === 'none') return [{ image, text, above: [], below: [] }];
    const caption = buildImageCaption({ overlay: str(stored['overlay']), credit: str(stored['credit']) } as ImageConfig);
    const lines = [caption.text, caption.source].filter((line) => line !== '');
    return [{ image, text, above: position === 'top' ? lines : [], below: position === 'top' ? [] : lines }];
  });
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
