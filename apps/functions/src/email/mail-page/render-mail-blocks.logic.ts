// apps/functions/src/email/mail-page/render-mail-blocks.logic.ts
//
// Renders the blocks of a Versand mail (spec 1.176 §9.1) into email HTML, or into the HTML of its letter, and turns them into
// the blocks of its Mitteilung (§9.3). Pure: the caller loads the event lines and passes Handlebars and the sanitizer.
// Stored blocks may hold anything. A mail cannot be corrected later, so what cannot be rendered is refused, never left out.
import {
  MAIL_BLOCK_TYPES,
  type ArticleBlock, type BlockAlign, type CalloutTone, type ColumnContentBlock, type ImageConfig, type ImageStyle, type MailBlockType, type SpaceSize,
} from '@okr/shared-models';
import { buildImageCaption, isSafeLinkTarget, mailTargetUrl, toPixelNumber, type MailEventLine } from '@okr/shared-util-core';

import { mailColorOf, textColorOn, tintOf } from '../../_shared/brand-color';
import { MAIL_BLOCK_TEMPLATES } from './mail-block-templates';
import { mailTextHtml } from './mail-text.logic';
import { hasVisibleContent, mailEventLimit, mailImageUrl, MailPageError, P_MARGIN_REPEAT } from './render-mail-page.logic';

export type MailTarget = 'mail' | 'print';

export interface MailBlockContext {
  hb: typeof import('handlebars');
  /** `sanitizeEmailBody` in production: its output is well formed, which `mailTextHtml` relies on */
  sanitize: (html: string) => Promise<string>;
  /** the upcoming event lines per calendar key, at least MAX_MAIL_EVENTS when there are */
  events: Record<string, MailEventLine[]>;
  /** the tenant app's public origin (`publicAppOrigin`): it makes an app path absolute */
  appOrigin: string;
  /** the brand colour; anything but `#rrggbb` is the dark grey */
  color: string;
  target: MailTarget;
}

type Loose = Record<string, unknown>;
/** A stored block that passed `checkBlocks`. */
type CheckedBlock = Loose & { id: string; type: MailBlockType };

/** The most top-level blocks of a mail, as in an article. */
export const MAX_MAIL_BLOCKS = 50;

/** The width the seeded layouts give the content (500 px with 30 px padding), and what is left of it on a phone. */
const CONTENT_WIDTH = 440;
const PHONE_WIDTH = 330;
/** between two columns, or two pictures of a gallery */
const GUTTER = 16;
const GALLERY_PICTURE_WIDTH = (CONTENT_WIDTH - GUTTER) / 2;

const TEXT_COLOR = '#222222';
const BACKGROUND = '#ffffff';
const NEUTRAL_TINT = '#f1f1f1';
/** light enough for dark text on every brand colour */
const TINT_SHARE = 0.12;

const ALIGNS: readonly BlockAlign[] = ['left', 'center', 'right'];
const TONES: readonly CalloutTone[] = ['primary', 'secondary', 'tertiary', 'neutral'];
/** How a button's table stands in its cell. */
const BUTTON_MARGINS: Record<BlockAlign, string> = { left: '0', center: '0 auto', right: '0 0 0 auto' };
const SPACES: Record<SpaceSize, number> = { small: 8, medium: 24, large: 48 };
/** What a column may hold. */
const IN_COLUMN: readonly unknown[] = ['text', 'image', 'button'];

// ------------------------------------------------- reading stored values ----------------------------------------------

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? value as T : fallback;
}

function alignOf(block: Loose): BlockAlign {
  return oneOf(block['align'], ALIGNS, 'left');
}

function objectOf(value: unknown): Loose {
  return isObject(value) ? value : {};
}

/** The address of a stored picture at `width` px; `''` when a mail cannot show it (no path, http, another scheme). */
function pictureUrl(image: Loose, width: number): string {
  const path = str(image['url']);
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !path.startsWith('https://')) return '';
  const url = mailImageUrl(path.replace(/ /g, '%20'), width);
  return url.startsWith('https://bkaiser.imgix.net/') ? `${url}&fit=max` : url;
}

function altOf(image: Loose): string {
  return str(image['altText']) || str(image['label']);
}

function linesOf(block: Loose, events: Record<string, MailEventLine[]>): MailEventLine[] {
  const lines: unknown = events[str(block['calendarKey'])];
  return Array.isArray(lines) ? lines.slice(0, mailEventLimit(block)) as MailEventLine[] : [];
}

/** The stored sizes when they fill the 12 columns, else equal ones, as the readers of an article draw them. */
function columnSizes(columns: Loose[]): number[] {
  const sizes = columns.map((column) => column['size']);
  const valid = sizes.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 11)
    && (sizes as number[]).reduce((sum, n) => sum + n, 0) === 12;
  return valid ? sizes as number[] : sizes.map(() => 12 / sizes.length);
}

// ------------------------------------------------- checking -----------------------------------------------------------

function invalid(reason: string, id?: string): MailPageError {
  return new MailPageError(id === undefined ? reason : `Block ${JSON.stringify(id)}: ${reason}`, 'invalid-block', id);
}

/** A picture must show something: itself, or its alt text. */
function isDrawable(image: Loose): boolean {
  return pictureUrl(image, 1) !== '' || altOf(image) !== '';
}

/** An entry of a gallery in which nothing was entered: no picture is lost when it is left out. */
function isBlankPicture(image: Loose): boolean {
  return str(image['url']) === '' && altOf(image) === '';
}

function checkContent(block: CheckedBlock): void {
  switch (block.type) {
    case 'text': case 'callout':
      if (typeof block['html'] !== 'string') throw invalid('a text without html', block.id);
      break;
    case 'image':
      if (!isObject(block['image']) || !isDrawable(block['image'])) throw invalid('an image without a usable picture', block.id);
      break;
    case 'gallery': {
      const images: unknown[] = Array.isArray(block['images']) ? block['images'] : [];
      if (!images.every((i) => isObject(i) && (isBlankPicture(i) || isDrawable(i)))) throw invalid('a gallery with an unusable picture', block.id);
      if (!images.some((i) => !isBlankPicture(i as Loose))) throw invalid('a gallery without a picture', block.id);
      break;
    }
    case 'button': {
      const cta = objectOf(block['cta']);
      if (!str(cta['label']) || !mailTargetUrl(cta['url'], 'https://app')) throw invalid('a button without label or usable target', block.id);
      break;
    }
    case 'events':
      if (!str(block['calendarKey'])) throw invalid('events without a calendar', block.id);
      break;
    case 'columns': {
      const columns: unknown[] = Array.isArray(block['columns']) ? block['columns'] : [];
      const areColumns = columns.every((column) => isObject(column) && Array.isArray(column['blocks']));
      if (!areColumns || columns.length < 2 || columns.length > 3) throw invalid('columns that are no two or three columns', block.id);
      for (const column of columns as Loose[]) (column['blocks'] as unknown[]).forEach((inner) => checkBlock(inner, true));
      break;
    }
  }
}

function checkBlock(block: unknown, inColumn: boolean): CheckedBlock {
  if (!isObject(block) || typeof block['id'] !== 'string' || block['id'] === '') throw invalid('a block without an id');
  const { id, type } = block;
  if (typeof type !== 'string') throw invalid('a block without a type', id);
  if (!(MAIL_BLOCK_TYPES as readonly string[]).includes(type)) {
    throw new MailPageError(`Block ${JSON.stringify(id)} has type ${JSON.stringify(type)}, which has no email template`, 'unknown-block-type', id);
  }
  if (inColumn && !IN_COLUMN.includes(type)) throw invalid(`type ${type} in a column`, id);
  const checked = block as CheckedBlock;
  checkContent(checked);
  return checked;
}

/** The blocks, or a `MailPageError` that names the first one that cannot be rendered. */
function checkBlocks(blocks: unknown): CheckedBlock[] {
  if (!Array.isArray(blocks)) throw invalid('The blocks are no list');
  if (blocks.length > MAX_MAIL_BLOCKS) throw invalid(`More than ${MAX_MAIL_BLOCKS} blocks`);
  return blocks.map((block) => checkBlock(block, false));
}

// ------------------------------------------------- rendering ----------------------------------------------------------

interface Part { html: string; hasContent: boolean }

const NOTHING: Part = { html: '', hasContent: false };

/** The width of a picture as its style has it: `percent` of its place, or px, or (anything else) all of it. */
function pictureWidth(style: Loose, place: number, stackedPlace: number): { attribute: number; css: string; drawn: number } {
  const width = str(style['width']);
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(width);
  const share = percent ? Number(percent[1]) : 0;
  if (share > 0 && share < 100) return { attribute: Math.round(place * share / 100), css: `${share}%`, drawn: Math.round(stackedPlace * share / 100) };
  const px = toPixelNumber(width);
  if (px === undefined) return { attribute: place, css: '100%', drawn: stackedPlace };
  const capped = Math.min(Math.round(px), CONTENT_WIDTH);
  return { attribute: Math.min(capped, place), css: `${capped}px`, drawn: Math.min(capped, stackedPlace) };
}

/** A mail address or phone number without its scheme, and without a subject. */
function printedAddress(url: string): string {
  return /^(mailto|tel):/.test(url) ? url.replace(/^[a-z]+:/, '').replace(/\?.*$/, '') : url;
}

/** Percent with two decimals, rounded down: the sum must not exceed 100, or the last column would not fit. */
function percentOf(part: number, whole: number): number {
  return Math.floor(part / whole * 10_000) / 100;
}

/** The columns at 440 px: the width with the gutter (right padding of all but the last), the width of the content. */
function columnMetrics(sizes: number[]): { width: number; content: number; gutter: number; attribute: number }[] {
  const last = sizes.length - 1;
  const columns = sizes.map((size, i) => {
    const content = (CONTENT_WIDTH + GUTTER) * size / 12 - GUTTER;
    const gutter = i === last ? 0 : GUTTER;
    return { width: content + gutter, content: Math.max(1, Math.floor(content)), gutter, attribute: 0 };
  });
  let rest = 100;
  columns.forEach((column, i) => {
    column.attribute = i === last ? rest : Math.round(column.width / CONTENT_WIDTH * 100);
    rest -= column.attribute;
  });
  return columns;
}

class BlockRenderer {
  private readonly compiled = new Map<MailBlockType, (data: unknown) => string>();
  private readonly color: string;
  private readonly print: boolean;
  /** what every cell sets; on paper nothing has a background */
  private readonly cell: string;

  constructor(private readonly ctx: MailBlockContext) {
    this.color = mailColorOf(ctx.color);
    this.print = ctx.target === 'print';
    this.cell = `color:${TEXT_COLOR};${this.print ? '' : `background-color:${BACKGROUND};`}`;
  }

  /** `place`: the width of the block at 440 px, `stackedPlace`: the widest it is ever drawn in the seeded layouts. */
  public async block(block: CheckedBlock, place = CONTENT_WIDTH, stackedPlace = CONTENT_WIDTH): Promise<Part> {
    switch (block.type) {
      case 'text': return this.text(block, place);
      case 'callout': return this.callout(block);
      case 'image': return this.draw('image', { ...this.picture(objectOf(block['image']), objectOf(block['imageStyle']), place, stackedPlace) });
      case 'gallery': return this.gallery(block);
      case 'button': return this.button(block);
      case 'columns': return this.columns(block);
      case 'divider': return this.draw('divider', {}, false);
      case 'space': return this.draw('space', { height: SPACES[oneOf(block['size'], Object.keys(SPACES) as SpaceSize[], 'medium')] }, false);
      case 'events': return this.events(block);
    }
  }

  private draw(type: MailBlockType, data: Loose, hasContent = true): Part {
    let template = this.compiled.get(type);
    if (!template) {
      template = this.ctx.hb.compile(MAIL_BLOCK_TEMPLATES[type], { strict: false });
      this.compiled.set(type, template);
    }
    return { html: template({ ...data, cell: this.cell, print: this.print }), hasContent };
  }

  private async html(block: Loose, width: number): Promise<string> {
    const html = mailTextHtml(await this.ctx.sanitize(block['html'] as string), { appOrigin: this.ctx.appOrigin, width, print: this.print });
    return hasVisibleContent(html) ? html : '';
  }

  private async text(block: Loose, place: number): Promise<Part> {
    const html = await this.html(block, place);
    return html ? this.draw('text', { html, align: alignOf(block) }) : NOTHING;
  }

  private async callout(block: Loose): Promise<Part> {
    const html = await this.html(block, CONTENT_WIDTH - 2 * 16);
    const neutral = oneOf(block['tone'], TONES, 'neutral') === 'neutral';
    return html ? this.draw('callout', { html, tint: neutral ? NEUTRAL_TINT : tintOf(this.color, TINT_SHARE) }) : NOTHING;
  }

  private picture(image: Loose, style: Loose, place: number, stackedPlace: number): Loose {
    const width = pictureWidth(style, place, stackedPlace);
    // the reader's rule: no caption without a position; over the picture is below it in a mail
    const position = str(style['captionPosition']) || 'none';
    const caption = buildImageCaption({ overlay: str(image['overlay']), credit: str(image['credit']) } as ImageConfig);
    const captionLines = position === 'none' ? [] : [caption.text, caption.source].filter((line) => line !== '');
    const above = position === 'top';
    return {
      src: pictureUrl(image, width.drawn * 2), alt: altOf(image), href: mailTargetUrl(image['actionUrl'], this.ctx.appOrigin),
      width: width.attribute, maxWidth: width.css, captionLines,
      captionAbove: above && captionLines.length > 0, captionBelow: !above && captionLines.length > 0,
      cell: this.cell, print: this.print,
    };
  }

  private gallery(block: Loose): Part {
    // neither a layout nor a width: always rows of two
    const style = { captionPosition: objectOf(block['imageStyle'])['captionPosition'] };
    const cells = (block['images'] as Loose[]).filter((image) => !isBlankPicture(image))
      .map((image) => this.picture(image, style, GALLERY_PICTURE_WIDTH, GALLERY_PICTURE_WIDTH));
    if (cells.length % 2 === 1) cells.push({ cell: this.cell, print: this.print });
    const rows = Array.from({ length: cells.length / 2 }, (_, i) => cells.slice(2 * i, 2 * i + 2));
    return this.draw('gallery', { rows });
  }

  private button(block: Loose): Part {
    const cta = objectOf(block['cta']);
    const url = mailTargetUrl(cta['url'], this.ctx.appOrigin);
    const outline = cta['style'] === 'secondary';
    const onColor = textColorOn(this.color);
    // white text readable on the colour means the colour is readable on white, too
    const onWhite = onColor === '#ffffff' ? this.color : TEXT_COLOR;
    return this.draw('button', {
      label: str(cta['label']), url, address: printedAddress(url), align: alignOf(block), margin: BUTTON_MARGINS[alignOf(block)],
      color: this.color, background: outline ? BACKGROUND : this.color, textColor: outline ? onWhite : onColor,
    });
  }

  private async columns(block: Loose): Promise<Part> {
    const stored = block['columns'] as Loose[];
    const metrics = columnMetrics(columnSizes(stored));
    const columns: Loose[] = [];
    let hasContent = false;
    for (const [i, column] of stored.entries()) {
      const { width, content, gutter, attribute } = metrics[i];
      const parts: Part[] = [];
      // stacked on the phone a picture is as wide as the mail
      for (const inner of column['blocks'] as CheckedBlock[]) parts.push(await this.block(inner, content, Math.max(content, PHONE_WIDTH)));
      hasContent ||= parts.some((part) => part.hasContent);
      columns.push({
        html: parts.map((part) => part.html).join(''), gutter, width: attribute, cell: this.cell,
        minWidth: percentOf(width, CONTENT_WIDTH), maxWidth: percentOf(PHONE_WIDTH + gutter, PHONE_WIDTH),
      });
    }
    return hasContent ? this.draw('columns', { columns }) : NOTHING;
  }

  private events(block: Loose): Part {
    const lines = linesOf(block, this.ctx.events);
    return lines.length > 0 ? this.draw('events', { title: str(block['title']), lines }, false) : NOTHING;
  }
}

/**
 * The HTML of the blocks in their order. Refuses (`MailPageError`, with the block's id where there is one) a type without a
 * template (`unknown-block-type`) and everything else that cannot be rendered (`invalid-block`). `hasContent`: a text, a
 * picture, a gallery, a button or a callout shows something (§8.1); events, lines and spaces alone do not count.
 */
export async function renderMailBlocks(blocks: unknown, ctx: MailBlockContext): Promise<{ html: string; hasContent: boolean }> {
  const checked = checkBlocks(blocks);
  const renderer = new BlockRenderer(ctx);
  const parts: Part[] = [];
  for (const block of checked) parts.push(await renderer.block(block));
  // One more pass over the whole: the output is in the sanitizer's own form, so composeBody's pass changes nothing but the
  // <p> margin, and nothing a template or a value produced can get past the mail policy.
  const html = await ctx.sanitize(parts.map((part) => part.html).filter((h) => h).join('\n'));
  return { html: html.replace(P_MARGIN_REPEAT, ''), hasContent: parts.some((part) => part.hasContent) };
}

// ------------------------------------------------- the Mitteilung -----------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function eventsHtml(title: string, lines: MailEventLine[]): string {
  const heading = title ? `<h2>${escapeHtml(title)}</h2>` : '';
  return heading + lines.map((line) => {
    const when = escapeHtml([line.date, line.time].filter((s) => s).join(' '));
    const place = line.place ? `<br />${escapeHtml(line.place)}` : '';
    return `<p>${when} <strong>${escapeHtml(line.title)}</strong>${place}</p>`;
  }).join('');
}

/** The stored fields of a picture; its link opens without a check in older apps, so only a safe one is kept. */
function noticeImage(image: Loose): ImageConfig {
  const text = (name: string) => (typeof image[name] === 'string' ? image[name] : '');
  return {
    label: text('label'), type: (typeof image['type'] === 'number' ? image['type'] : 0) as ImageConfig['type'], url: text('url'),
    actionUrl: isSafeLinkTarget(image['actionUrl']) ? text('actionUrl') : '', altText: text('altText'), overlay: text('overlay'),
    documentKey: text('documentKey'), credit: text('credit'),
  };
}

/** A copy of a stored object (a style, a slideshow) as an optional field; no `undefined`, which Firestore refuses. */
function optionalObject(name: string, value: unknown): Loose {
  if (!isObject(value)) return {};
  return { [name]: Object.fromEntries(Object.entries(value).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))) };
}

async function noticeBlock(block: CheckedBlock, ctx: Pick<MailBlockContext, 'sanitize' | 'events'>): Promise<ArticleBlock | undefined> {
  const id = block.id;
  const align = block['align'] === undefined ? {} : { align: alignOf(block) };
  switch (block.type) {
    case 'text': return { id, type: 'text', html: await ctx.sanitize(block['html'] as string), ...align };
    case 'callout': return { id, type: 'callout', html: await ctx.sanitize(block['html'] as string), tone: oneOf(block['tone'], TONES, 'neutral') };
    case 'image':
      return { id, type: 'image', image: noticeImage(block['image'] as Loose), ...optionalObject('imageStyle', block['imageStyle']) as { imageStyle?: Partial<ImageStyle> } };
    case 'gallery':
      return {
        id, type: 'gallery', images: (block['images'] as Loose[]).map(noticeImage),
        ...optionalObject('imageStyle', block['imageStyle']), ...optionalObject('slideshow', block['slideshow']),
        ...(typeof block['layout'] === 'string' ? { layout: block['layout'] } : {}),
      };
    case 'button': {
      const cta = objectOf(block['cta']);
      return { id, type: 'button', cta: { label: str(cta['label']), url: str(cta['url']), style: cta['style'] === 'secondary' ? 'secondary' : 'primary' }, ...align };
    }
    case 'columns': {
      const stored = block['columns'] as Loose[];
      const sizes = columnSizes(stored);
      const columns = [];
      for (const [i, column] of stored.entries()) {
        const blocks: ColumnContentBlock[] = [];
        // only what a column may hold passed checkBlocks, and none of that is left out
        for (const inner of column['blocks'] as CheckedBlock[]) blocks.push(await noticeBlock(inner, ctx) as ColumnContentBlock);
        columns.push({ size: sizes[i], blocks });
      }
      return { id, type: 'columns', columns };
    }
    case 'divider': return { id, type: 'divider' };
    case 'space': return { id, type: 'space', size: oneOf(block['size'], Object.keys(SPACES) as SpaceSize[], 'medium') };
    case 'events': {
      const lines = linesOf(block, ctx.events);
      return lines.length > 0 ? { id, type: 'text', html: await ctx.sanitize(eventsHtml(str(block['title']), lines)) } : undefined;
    }
  }
}

/**
 * The blocks of the Mitteilung: html sanitized, the events block as a text with its lines as sent (left out without any),
 * app paths kept as paths, tones as stored, ids kept. Only known fields are taken over. Refuses what `renderMailBlocks` refuses.
 */
export async function noticeBlocks(blocks: unknown, ctx: Pick<MailBlockContext, 'sanitize' | 'events'>): Promise<ArticleBlock[]> {
  const result: ArticleBlock[] = [];
  for (const block of checkBlocks(blocks)) {
    const made = await noticeBlock(block, ctx);
    if (made) result.push(made);
  }
  return result;
}
