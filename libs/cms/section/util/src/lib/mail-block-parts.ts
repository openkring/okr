import {
  ARTICLE_BLOCK_TYPES, CAPTION_POSITIONS, IMAGE_STYLE_SHAPE, ImageActionType, ImageType,
  type ArticleBlockType, type BlockAlign, type CalloutTone, type ColumnContentBlock, type ImageConfig, type ImageStyle, type MailBlock, type SectionCta, type TextBlock,
} from '@okr/shared-models';
import { mailTargetUrl } from '@okr/shared-util-core';

import { BLOCK_ALIGNS, SPACE_SIZES, isObject, type Loose } from './article-block.util';
import type { NewId } from './article-editor.util';

/**
 * What the conversions into the blocks of a Versand mail share (spec 1.176 §8.3, §8.5). Internal: not exported from the lib.
 * Pure: nothing is mutated and nothing that comes out is shared with what went in; stored data may be malformed and nothing throws on it.
 */

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function objectOf(value: unknown): Loose {
  return isObject(value) ? value : {};
}

/** Whether an html shows anything: an image, or text that is no blank (the server's rule for an empty mail). */
export function showsSomething(html: unknown): boolean {
  if (typeof html !== 'string') return false;
  const body = html.replace(/<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>/gi, '');
  return /<img\b/i.test(body) || body.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').trim() !== '';
}

// ------------------------------------------------------- copying -------------------------------------------------------

function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepCopy) as T;
  return isObject(value) ? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, deepCopy(v)])) as T : value;
}

/** The block as it is, with new ids (those of inner blocks, too). */
export function copiedBlock(block: Loose, newId: NewId): MailBlock {
  const copy: Loose = { ...deepCopy(block), id: newId() };
  if (copy['type'] === 'columns' && Array.isArray(copy['columns'])) {
    copy['columns'] = copy['columns'].map((column: unknown) => isObject(column) && Array.isArray(column['blocks'])
      ? { ...column, blocks: column['blocks'].map((inner: unknown) => (isObject(inner) ? copiedBlock(inner, newId) : inner)) }
      : column);
  }
  return copy as unknown as MailBlock;
}

// ------------------------------------------------------- texts -------------------------------------------------------

export function textBlock(id: string, html: string): TextBlock {
  return { id, type: 'text', html };
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Title, subtitle and intro of a section as html, the intro above or below; '' without any. */
export function headerHtml(section: Loose): string {
  const [title, subTitle] = [str(section['title']), str(section['subTitle'])];
  // the intro keeps its line breaks
  const intro = str(section['intro']).split(/\r?\n/).map(escapeHtml).join('<br>');
  const introHtml = intro ? `<p>${intro}</p>` : '';
  const heading = (title ? `<h2>${escapeHtml(title)}</h2>` : '') + (subTitle ? `<p>${escapeHtml(subTitle)}</p>` : '');
  return section['introPosition'] === 'above' ? introHtml + heading : heading + introHtml;
}

/** The German text of a block: `html`, or (as on the website) the stored German translation when that is empty. */
export function germanHtml(block: Loose): string {
  if (typeof block['html'] === 'string' && block['html'] !== '') return block['html'];
  const translated = objectOf(block['htmlI18n'])['de'];
  return typeof translated === 'string' ? translated : '';
}

// ------------------------------------------------------- pictures -------------------------------------------------------

/** A picture entry with something in it: an address, or at least a text that says what it shows. */
export function isPicture(image: unknown): image is Loose {
  return isObject(image) && (str(image['url']) !== '' || str(image['altText']) !== '' || str(image['label']) !== '');
}

/** Only when the style says so does a click on a picture follow its link. */
function followsLink(style: unknown): boolean {
  return objectOf(style)['action'] === ImageActionType.FollowLink;
}

/** Whether a mail can open the target (any origin will do, only the form counts). */
export function isMailTarget(url: unknown): boolean {
  return mailTargetUrl(url, 'https://app') !== '';
}

/** The picture with all its texts; a link that readers of the article cannot follow, or that a mail cannot open, stays behind. */
export function mailImage(value: unknown, style: unknown): ImageConfig {
  const image = objectOf(value);
  const type = image['type'];
  return {
    label: str(image['label']), type: typeof type === 'number' && type in ImageType ? type : ImageType.Image, url: str(image['url']),
    actionUrl: followsLink(style) && isMailTarget(image['actionUrl']) ? str(image['actionUrl']) : '', altText: str(image['altText']), overlay: str(image['overlay']),
    documentKey: str(image['documentKey']), credit: str(image['credit']),
  };
}

/** Not in a mail: zoom, and the two fields that nothing reads any more. The action is set by the link alone. */
const DROPPED_STYLES = ['action', 'zoomFactor', 'showTitle', 'showSource'];

/** The style of a picture without zoom and actions; a caption over the picture stands below it, as the mail draws it. */
export function mailImageStyle(value: unknown): { imageStyle?: Partial<ImageStyle> } {
  if (!isObject(value)) return {};
  const shape = IMAGE_STYLE_SHAPE as unknown as Loose;
  const style: Loose = Object.fromEntries(Object.keys(shape)
    .filter((key) => !DROPPED_STYLES.includes(key) && typeof value[key] === typeof shape[key]).map((key) => [key, value[key]]));
  if (String(style['captionPosition']).endsWith('-overlay')) style['captionPosition'] = 'bottom';
  if (!(CAPTION_POSITIONS as readonly unknown[]).includes(style['captionPosition'])) delete style['captionPosition'];
  if (followsLink(value)) style['action'] = ImageActionType.FollowLink;
  return Object.keys(style).length > 0 ? { imageStyle: style } : {};
}

/** A picture that leads to `url`. */
export function linkedImage(image: ImageConfig, url: string): { image: ImageConfig; imageStyle: Partial<ImageStyle> } {
  const imageStyle = { action: ImageActionType.FollowLink };
  return { image: { ...mailImage(image, imageStyle), actionUrl: url }, imageStyle };
}

// ------------------------------------------------------- the other blocks -------------------------------------------------------

/** The button without translations. */
export function mailCta(value: unknown): SectionCta {
  const cta = objectOf(value);
  return { label: str(cta['label']), url: str(cta['url']), style: cta['style'] === 'secondary' ? 'secondary' : 'primary' };
}

function alignOf(block: Loose): { align?: BlockAlign } {
  const align = BLOCK_ALIGNS.find((known) => known === block['align']);
  return align ? { align } : {};
}

/** A mail has two tones; a stored one that is unknown is neutral, as readers draw it. */
function mailTone(tone: unknown): CalloutTone {
  return tone === 'primary' || tone === 'secondary' || tone === 'tertiary' ? 'primary' : 'neutral';
}

/** The stored sizes when they fill the 12 columns, else equal ones, as readers draw them. */
function columnSizes(columns: Loose[]): number[] {
  const sizes = columns.map((column) => column['size']);
  const isFull = sizes.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 11) && (sizes as number[]).reduce((sum, n) => sum + n, 0) === 12;
  return isFull ? sizes as number[] : sizes.map(() => 12 / sizes.length);
}

/**
 * A block of an article as a block of a mail: a new id, no translations, placeholders replaced, and none of the settings that a mail
 * does not have. A block of an unknown type is copied as it is: it is an error that the author sees, never left out silently.
 */
export function mailBlockOf(block: Loose, replace: (html: string) => string, newId: NewId): MailBlock {
  const type = block['type'];
  if (!(ARTICLE_BLOCK_TYPES as readonly unknown[]).includes(type)) return copiedBlock(block, newId);
  // the ids of inner blocks come after it
  const id = newId();
  switch (type as ArticleBlockType) {
    case 'text': return { ...textBlock(id, replace(germanHtml(block))), ...alignOf(block) };
    case 'callout': return { id, type: 'callout', html: replace(germanHtml(block)), tone: mailTone(block['tone']) };
    case 'image': return { id, type: 'image', image: mailImage(block['image'], block['imageStyle']), ...mailImageStyle(block['imageStyle']) };
    case 'gallery': {
      const images = Array.isArray(block['images']) ? block['images'].filter(isPicture) : [];
      return { id, type: 'gallery', images: images.map((image) => mailImage(image, block['imageStyle'])), ...mailImageStyle(block['imageStyle']) };
    }
    case 'button': return { id, type: 'button', cta: mailCta(block['cta']), ...alignOf(block) };
    case 'columns': {
      const columns = Array.isArray(block['columns']) ? block['columns'].filter(isObject) : [];
      const sizes = columnSizes(columns);
      // whatever may not stand in a column comes along: it is an error, too
      const inner = (column: Loose) => (Array.isArray(column['blocks']) ? column['blocks'] : []).filter(isObject).map((b) => mailBlockOf(b, replace, newId) as ColumnContentBlock);
      return { id, type: 'columns', columns: columns.map((column, i) => ({ size: sizes[i], blocks: inner(column) })) };
    }
    case 'divider': return { id, type: 'divider' };
    case 'space': return { id, type: 'space', size: SPACE_SIZES.find((size) => size === block['size']) ?? 'medium' };
  }
}
