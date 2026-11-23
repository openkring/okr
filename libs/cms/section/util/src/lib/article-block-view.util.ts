import {
  ARTICLE_BLOCK_TYPES, IMAGE_STYLE_SHAPE, blockImages, type ArticleBlock, type ArticleSlideshow, type BlockAlign, type CalloutTone, type ImageConfig,
  type ImageLayoutId, type ImageStyle, type SectionCta, type SpaceSize,
} from '@okr/shared-models';
import { resolveImageStyle, stripHtml } from '@okr/shared-util-core';

import { BLOCK_ALIGNS, CALLOUT_TONES, COLUMN_BLOCK_TYPES, SPACE_SIZES, isObject, type Loose } from './article-block.util';
import { resolveImageLayout } from './image-layout.util';
import { validCtas } from './section-cta.util';
import { resolveSlideshow } from './slideshow.util';

/**
 * What the app draws of the blocks of a free article (spec 1.173 §7, §9.1). Stored blocks may be malformed or of a type
 * this app does not know: everything that cannot be drawn is left out here, so a view can be drawn without a check.
 * All functions are pure and never throw.
 */

/** A view keeps the id of its block as `key` (made unique), so that a moved block keeps its elements. */
interface BaseView { key: string }
export interface TextBlockView extends BaseView { type: 'text'; html: string; align: BlockAlign }
export interface ImageBlockView extends BaseView { type: 'image'; image: ImageConfig; imageStyle: ImageStyle }
export interface ButtonBlockView extends BaseView { type: 'button'; cta: SectionCta; align: BlockAlign }
/** a gallery is drawn as one of these three, or as an image when there is only one */
export interface GridBlockView extends BaseView { type: 'grid'; images: ImageConfig[]; imageStyle: ImageStyle; layout: ImageLayoutId }
export interface CarouselBlockView extends BaseView { type: 'carousel'; images: ImageConfig[]; imageStyle: ImageStyle }
export interface SlideshowBlockView extends BaseView { type: 'slideshow'; images: ImageConfig[]; settings: ArticleSlideshow }
export interface CalloutBlockView extends BaseView { type: 'callout'; html: string; tone: CalloutTone }
export interface DividerBlockView extends BaseView { type: 'divider' }
export interface SpaceBlockView extends BaseView { type: 'space'; size: SpaceSize }
export type ColumnContentView = TextBlockView | ImageBlockView | ButtonBlockView;
/** `holdsText`: the column has a text block, even an empty one that is not drawn (it carries the header, see `articleHeaderPlace`) */
export interface ArticleColumnView { blocks: ColumnContentView[]; holdsText: boolean }
/** `template`: the CSS `grid-template-columns` of the columns side by side */
export interface ColumnsBlockView extends BaseView { type: 'columns'; columns: ArticleColumnView[]; template: string; stackReverse: boolean }

export type ArticleBlockView =
  | ColumnContentView | GridBlockView | CarouselBlockView | SlideshowBlockView | CalloutBlockView | DividerBlockView | SpaceBlockView
  | ColumnsBlockView;

/**
 * Where the header of a free article is drawn: above the blocks (`card`), in the text column of the first block, or as
 * title and subtitle on the images of the first block.
 */
export type ArticleHeaderPlace = 'card' | 'column' | 'slideshow';

function objects(value: unknown): Loose[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function blocksOf(value: unknown): Loose[] {
  return objects(value).filter((b) => typeof b['type'] === 'string');
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? value as T : fallback;
}

// ------------------------------------------------- one block ----------------------------------------------------------

/** The html, or '' when it shows nothing: no text, and no element that is visible without text. */
function drawnHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (/<(img|hr|iframe|video|audio|table)\b/i.test(value)) return value;
  return stripHtml(value).replace(/&nbsp;|\s/g, '') === '' ? '' : value;
}

/** The texts of an image that are read as strings. */
const IMAGE_TEXTS = ['label', 'actionUrl', 'altText', 'overlay', 'documentKey', 'credit'];

/** The image when it has a path, its malformed texts emptied; the same object when there are none. */
function drawnImage(value: unknown): ImageConfig | undefined {
  if (!isObject(value) || typeof value['url'] !== 'string' || value['url'].trim() === '') return undefined;
  const bad = IMAGE_TEXTS.filter((name) => value[name] !== undefined && typeof value[name] !== 'string');
  const image = bad.length > 0 ? { ...value, ...Object.fromEntries(bad.map((name) => [name, ''])) } : value;
  return image as unknown as ImageConfig;
}

/** The stored style over the defaults; a value of the wrong type counts as absent. */
function drawnImageStyle(value: unknown): ImageStyle {
  if (!isObject(value)) return resolveImageStyle(undefined);
  const shape = IMAGE_STYLE_SHAPE as unknown as Loose;
  const kept = Object.entries(value).filter(([key, v]) => !(key in shape) || typeof v === typeof shape[key]);
  return resolveImageStyle(Object.fromEntries(kept) as Partial<ImageStyle>);
}

function galleryView(block: Loose, key: string): GridBlockView | CarouselBlockView | SlideshowBlockView | ImageBlockView | undefined {
  const images = objects(block['images']).map(drawnImage).filter((image) => image !== undefined);
  if (images.length === 0) return undefined;
  const imageStyle = drawnImageStyle(block['imageStyle']);
  // the rules of the classic article (article-section): a layout, else the slideshow, else the carousel
  const layout = resolveImageLayout(block['layout'] as string | undefined, images.length);
  if (layout && layout !== 'slider') return { key, type: 'grid', images, imageStyle, layout };
  if (images.length === 1) return { key, type: 'image', image: images[0], imageStyle };
  const settings = resolveSlideshow(block['slideshow'] as Partial<ArticleSlideshow> | undefined, images.length);
  return settings ? { key, type: 'slideshow', images, settings } : { key, type: 'carousel', images, imageStyle };
}

/** The sizes as `grid-template-columns`; equal columns unless every size is a positive number. */
export function columnsTemplate(sizes: unknown[]): string {
  const valid = sizes.every((s) => typeof s === 'number' && Number.isFinite(s) && s > 0);
  // minmax(0, …): a long word or a wide picture must not widen its column
  return sizes.map((s) => `minmax(0, ${valid ? s : 1}fr)`).join(' ');
}

// ------------------------------------------------- all blocks ---------------------------------------------------------

type ReplaceText = (html: string) => string;

/** Turns blocks into views with unique keys. */
class ViewBuilder {
  private readonly keys = new Set<string>();
  constructor(private readonly replace: ReplaceText) {}

  public views(value: unknown): ArticleBlockView[] {
    return blocksOf(value).map((block) => this.view(block)).filter((view) => view !== undefined);
  }

  private view(block: Loose): ArticleBlockView | undefined {
    switch (block['type']) {
      case 'text':
      case 'image':
      case 'button': return this.contentView(block);
      case 'gallery': return galleryView(block, this.key(block));
      case 'columns': return this.columnsView(block);
      case 'callout': {
        const html = this.html(block);
        return html ? { key: this.key(block), type: 'callout', html, tone: oneOf(block['tone'], CALLOUT_TONES, 'neutral') } : undefined;
      }
      case 'divider': return { key: this.key(block), type: 'divider' };
      case 'space': return { key: this.key(block), type: 'space', size: oneOf(block['size'], SPACE_SIZES, 'medium') };
      default: return undefined;
    }
  }

  /** what a column may hold */
  private contentView(block: Loose): ColumnContentView | undefined {
    const align = oneOf(block['align'], BLOCK_ALIGNS, 'left');
    switch (block['type']) {
      case 'text': {
        const html = this.html(block);
        return html ? { key: this.key(block), type: 'text', html, align } : undefined;
      }
      case 'image': {
        const image = drawnImage(block['image']);
        return image ? { key: this.key(block), type: 'image', image, imageStyle: drawnImageStyle(block['imageStyle']) } : undefined;
      }
      case 'button': {
        const cta = validCtas([block['cta'] as SectionCta], 1)[0];
        return cta ? { key: this.key(block), type: 'button', cta, align } : undefined;
      }
      default: return undefined;
    }
  }

  private columnsView(block: Loose): ColumnsBlockView | undefined {
    const columns = objects(block['columns']);
    if (columns.length === 0) return undefined;
    return {
      key: this.key(block), type: 'columns', template: columnsTemplate(columns.map((c) => c['size'])), stackReverse: block['stackReverse'] === true,
      columns: columns.map((column) => {
        const blocks = blocksOf(column['blocks']);
        return { blocks: blocks.map((b) => this.contentView(b)).filter((view) => view !== undefined), holdsText: blocks.some((b) => b['type'] === 'text') };
      }),
    };
  }

  private html(block: Loose): string {
    const html = drawnHtml(block['html']);
    return html ? this.replace(html) : '';
  }

  private key(block: Loose): string {
    const id = typeof block['id'] === 'string' ? block['id'] : '';
    let key = id;
    for (let n = 1; key === '' || this.keys.has(key); n++) key = `${id}#${n}`;
    this.keys.add(key);
    return key;
  }
}

/** The blocks as they are drawn, in order; `replace` is applied to every html (placeholders such as @APPNAME@). */
export function articleBlockViews(blocks: ArticleBlock[] | undefined, replace: ReplaceText = (html) => html): ArticleBlockView[] {
  return new ViewBuilder(replace).views(blocks);
}

/** The images that the blocks draw, in reading order, without their layout (the fallback of a free article; never the cover). */
export function drawnBlockImages(blocks: ArticleBlock[] | undefined): ImageConfig[] {
  return blockImages(blocksOf(blocks) as unknown as ArticleBlock[]).map(drawnImage).filter((image) => image !== undefined);
}

/** The types that are left out because this app does not know them, or not inside a column (for a warning in development). */
export function undrawnBlockTypes(blocks: ArticleBlock[] | undefined): string[] {
  return blocksOf(blocks).flatMap((block) => {
    const type = block['type'] as string;
    if (type === 'columns') {
      return objects(block['columns']).flatMap((c) => blocksOf(c['blocks'])).map((b) => b['type'] as string).filter((t) => !COLUMN_BLOCK_TYPES.includes(t));
    }
    return (ARTICLE_BLOCK_TYPES as readonly string[]).includes(type) ? [] : [type];
  });
}

/**
 * Where the header of a free article is drawn (spec 1.173 §9.1), decided by its first block: one image beside one text in
 * an article with its own background carries the header in the text column; a slideshow carries title and subtitle on
 * its images; anything else has it above.
 */
export function articleHeaderPlace(blocks: ArticleBlock[] | undefined, hasBackground: boolean): ArticleHeaderPlace {
  const first = blocksOf(blocks)[0];
  if (first?.['type'] === 'gallery') return galleryView(first, '')?.type === 'slideshow' ? 'slideshow' : 'card';
  if (first?.['type'] !== 'columns' || !hasBackground) return 'card';
  const columns = objects(first['columns']).map((c) => blocksOf(c['blocks']).map((b) => b['type']));
  if (columns.length !== 2 || columns.some((types) => types.length !== 1)) return 'card';
  const types = columns.flat();
  return types.includes('image') && types.includes('text') ? 'column' : 'card';
}
