import { ViewPosition } from './enums/view-position.enum';
import { SIDE_BY_SIDE_LAYOUT, articleImagePosition } from './article-layout.util';
import type { I18nString } from './i18n.model';
import type { ImageConfig } from './image.model';
import {
  SLIDESHOW_EFFECTS, type ArticleBlock, type ArticleConfig, type ArticleSlideshow, type ButtonBlock, type ColumnsBlock, type EditorConfig,
  type GalleryBlock, type ImageBlock, type SectionCta, type TextBlock,
} from './section.model';

/**
 * The two kinds of article (spec 1.173 §8). A CLASSIC article has a shape that the fixed fields can express: it has no
 * `blocks`, or blocks of one of the shapes of §8.1. It is converted back to those fields and drawn by the code that has
 * always drawn them. A FREE article has blocks beyond that; only the block renderers can draw it.
 *
 * All functions are pure, never mutate their input and never throw on malformed stored data.
 */

/** What these functions read of a section: a model as well as a raw Firestore document. */
export interface ArticleLike { type?: string; content?: { htmlContent?: string; position?: number; colSize?: number }; properties?: object }

/** The fixed fields that `blocks` replace. Stored values next to `blocks` are ignored by every reader. */
interface ClassicFields {
  content: EditorConfig;
  properties: Pick<ArticleConfig, 'images' | 'imageStyle' | 'imageLayout' | 'slideshow' | 'cta' | 'contentI18n'>;
}
const REPLACED_FIELDS: readonly string[] = ['images', 'imageStyle', 'imageLayout', 'slideshow', 'cta', 'contentI18n'];

/** The image column of an article without a (valid) column size, of 12. */
const DEFAULT_COL_SIZE = 6;

// ------------------------------------------------- reading stored data ------------------------------------------------

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validBlocks(value: unknown): ArticleBlock[] {
  return Array.isArray(value) ? value.filter((b) => isObject(b) && typeof (b as { type?: unknown }).type === 'string') : [];
}

function validImages(value: unknown): ImageConfig[] {
  return Array.isArray(value) ? value.filter(isObject) as ImageConfig[] : [];
}

function configOf(s: ArticleLike | undefined): Partial<ArticleConfig> {
  return isObject(s?.properties) ? s.properties : {};
}

function coverOf(s: ArticleLike | undefined): ImageConfig | undefined {
  const cover = configOf(s).cover;
  return isObject(cover) ? cover : undefined;
}

/** The string values of a stored translation; `undefined` when it is no object. */
function validI18n(value: unknown): I18nString | undefined {
  return isObject(value) ? Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string')) : undefined;
}

function columnsOf(block: ColumnsBlock): { size: number; blocks: ArticleBlock[] }[] {
  return Array.isArray(block.columns) ? block.columns.filter(isObject).map((c) => ({ size: c.size, blocks: validBlocks(c.blocks) })) : [];
}

/** The same object without its undefined values (Firestore rejects them). */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The blocks in reading order, columns replaced by their content. */
function flatten(blocks: ArticleBlock[]): ArticleBlock[] {
  return blocks.flatMap((b) => b.type === 'columns' ? columnsOf(b).flatMap((c) => c.blocks.filter((inner) => inner.type !== 'columns')) : [b]);
}

/** The text and callout blocks, i.e. everything with HTML. */
function htmlBlocks(blocks: ArticleBlock[]): { html: string; htmlI18n: I18nString }[] {
  return flatten(blocks).flatMap((b) => b.type === 'text' || b.type === 'callout'
    ? [{ html: typeof b.html === 'string' ? b.html : '', htmlI18n: validI18n(b.htmlI18n) ?? {} }]
    : []);
}

/**
 * The blocks of an article; `undefined` when it has none (an old article) or is no article (`type` absent counts as
 * one). Entries that are no object or have no string `type` are dropped; unknown types are kept.
 */
export function articleBlocksOf(s: ArticleLike | undefined): ArticleBlock[] | undefined {
  if (s?.type && s.type !== 'article') return undefined;
  const blocks = configOf(s).blocks;
  return Array.isArray(blocks) ? validBlocks(blocks) : undefined;
}

/** All images in reading order, columns flattened. */
export function blockImages(blocks: ArticleBlock[]): ImageConfig[] {
  return flatten(blocks).flatMap((b) => {
    if (b.type === 'image') return validImages([b.image]);
    return b.type === 'gallery' ? validImages(b.images) : [];
  });
}

/** The (German) HTML of all text and callout blocks in reading order, columns flattened. */
export function blockHtml(blocks: ArticleBlock[]): string {
  return htmlBlocks(blocks).map((b) => b.html).join('');
}

/**
 * The HTML per language: a language appears if at least one block is translated, blocks without it (an empty text is no
 * translation) contribute German. German itself comes along, from `html`. `undefined` without any translation.
 */
function blockHtmlI18n(blocks: ArticleBlock[]): I18nString | undefined {
  const texts = htmlBlocks(blocks).map(({ html, htmlI18n }) => ({
    html, translated: new Map(Object.entries(htmlI18n).filter(([lang, text]) => lang !== 'de' && text.trim() !== '')),
  }));
  const langs = new Set(texts.flatMap((t) => [...t.translated.keys()]));
  if (langs.size === 0) return undefined;
  const result: I18nString = { de: blockHtml(blocks) };
  for (const lang of langs) result[lang] = texts.map((t) => t.translated.get(lang) ?? t.html).join('');
  return result;
}

/**
 * Whether a stored slideshow runs: a known effect other than `none`, and the carousel layout (`slider` or none). It does
 * not look at the number of images: the app needs two, the website draws a single one as a still header.
 */
export function isSlideshowActive(slideshow: Partial<ArticleSlideshow> | undefined, imageLayout: string | undefined): boolean {
  if (imageLayout && imageLayout !== 'slider') return false;
  const effect = slideshow?.effect;
  return effect !== undefined && effect !== 'none' && SLIDESHOW_EFFECTS.includes(effect);
}

/** The picture of teasers and lists: the `cover`, else the first image. */
export function articleCover(s: ArticleLike | undefined): ImageConfig | undefined {
  const blocks = articleBlocksOf(s);
  return blocks ? coverOf(s) ?? blockImages(blocks)[0] : validImages(configOf(s).images)[0];
}

// ------------------------------------------------- old fields → blocks ------------------------------------------------

/**
 * The blocks of an article without `blocks` (spec 1.173 §8.1). What is not drawn is dropped (an image style without
 * images, the layout of a single image …). These articles do not convert exactly and must not be migrated, see
 * `convertsExactly`: one image beside the text with an active slideshow; a column size outside 1–11; an image without a
 * url (the website counts only the images with one, so with `['a.jpg', '']` it draws a single image left of the text
 * where the app draws two on top — a shape that no blocks have).
 */
export function blocksFromClassic(s: ArticleLike): { blocks: ArticleBlock[]; cover?: ImageConfig } {
  const p = configOf(s);
  const images = validImages(p.images);
  const html = s.content?.htmlContent;
  const text: TextBlock = defined({ id: 'classic-text', type: 'text', html: typeof html === 'string' ? html : '', htmlI18n: p.contentI18n });
  const position = articleImagePosition(s.content?.position, images.length, p.imageLayout);
  const button: ButtonBlock[] = isObject(p.cta) ? [{ id: 'classic-button', type: 'button', cta: p.cta }] : [];

  if (isGallery(images.length, p.imageLayout, p.slideshow, position)) {
    const gallery: GalleryBlock = defined({
      id: 'classic-gallery', type: 'gallery', images, imageStyle: p.imageStyle, layout: p.imageLayout, slideshow: p.slideshow,
    });
    return { blocks: [...(position === ViewPosition.Bottom ? [text, gallery] : [gallery, text]), ...button] };
  }
  if (images.length === 0) return { blocks: [text, ...button] };

  const image: ImageBlock = defined({ id: 'classic-image', type: 'image', image: images[0], imageStyle: p.imageStyle });
  const size = colSizeOf(s.content?.colSize);
  const imageColumn = { size, blocks: [image] };
  const textColumn = { size: 12 - size, blocks: [text] };
  switch (position) {
    case ViewPosition.Top: return { blocks: [image, text, ...button] };
    case ViewPosition.Bottom: return { blocks: [text, image, ...button] };
    case ViewPosition.Left: return { blocks: [{ id: 'classic-columns', type: 'columns', columns: [imageColumn, textColumn] }, ...button] };
    case ViewPosition.Right: return { blocks: [{ id: 'classic-columns', type: 'columns', columns: [textColumn, imageColumn] }, ...button] };
    default: return { blocks: [text, ...button], cover: images[0] };
  }
}

/** Several images, or a single one that is drawn like several: in a row, or as the still slideshow header of the website. */
function isGallery(count: number, layout: string | undefined, slideshow: Partial<ArticleSlideshow> | undefined, position: ViewPosition): boolean {
  if (count !== 1) return count > 1;
  if (layout === SIDE_BY_SIDE_LAYOUT) return true;
  return (position === ViewPosition.Top || position === ViewPosition.Bottom) && isSlideshowActive(slideshow, layout);
}

function isColSize(size: unknown): size is number {
  return Number.isInteger(size) && (size as number) >= 1 && (size as number) <= 11;
}

function colSizeOf(size: unknown): number {
  return isColSize(size) ? size : DEFAULT_COL_SIZE;
}

// ------------------------------------------------- blocks → old fields ------------------------------------------------

/** Whether the article has blocks beyond the classic shapes, so that only the block renderers can draw it. */
export function isFreeArticle(s: ArticleLike | undefined): boolean {
  const blocks = articleBlocksOf(s);
  return blocks !== undefined && matchClassic(blocks, coverOf(s)) === undefined;
}

/**
 * The section with its old fields filled, for reading only (never save it). Without blocks (or not an article): the same object. Classic: converted
 * exactly. Free: all text, all images and the first button, for readers that only want those; it does not draw like the
 * article. Stored old fields next to `blocks` are ignored; `blocks` and `cover` stay.
 */
export function withClassicFields<T extends ArticleLike | undefined>(s: T): T {
  const blocks = articleBlocksOf(s);
  if (!s || !blocks) return s;
  const cover = coverOf(s);
  const fields = matchClassic(blocks, cover) ?? fallback(blocks, cover);
  const kept = Object.entries(configOf(s)).filter(([key]) => !REPLACED_FIELDS.includes(key));
  return { ...s, content: fields.content, properties: { ...Object.fromEntries(kept), ...fields.properties } };
}

function classicFields(
  html: string, position: ViewPosition, properties: ClassicFields['properties'], colSize = DEFAULT_COL_SIZE,
): ClassicFields {
  return { content: { htmlContent: html, position, colSize }, properties: defined(properties) };
}

function fallback(blocks: ArticleBlock[], cover: ImageConfig | undefined): ClassicFields {
  return classicFields(blockHtml(blocks), ViewPosition.Top, {
    images: [...(cover ? [cover] : []), ...blockImages(blocks)],
    cta: flatten(blocks).map(ctaOf).find((cta) => cta !== undefined),
    contentI18n: blockHtmlI18n(blocks),
  });
}

function ctaOf(block: ArticleBlock): SectionCta | undefined {
  return block.type === 'button' && isObject(block.cta) ? block.cta : undefined;
}

/** `left` is what today's fields draw, so it is no alignment. */
function isAligned(block: TextBlock | ButtonBlock): boolean {
  return !!block.align && block.align !== 'left';
}

/** The old fields that draw exactly these blocks (spec 1.173 §8.1), or `undefined`: the article is free. */
function matchClassic(blocks: ArticleBlock[], cover: ImageConfig | undefined): ClassicFields | undefined {
  if (blocks.length === 0) return classicFields('', ViewPosition.None, { images: cover ? [cover] : [] });
  const last = blocks[blocks.length - 1];
  if (last.type !== 'button') return matchBody(blocks, cover, undefined);
  const cta = ctaOf(last);
  return cta && !isAligned(last) ? matchBody(blocks.slice(0, -1), cover, cta) : undefined;
}

/**
 * The article without its button: text alone, columns, or images above or below the text. A cover is never drawn in the
 * article, so next to images it changes nothing here (`articleCover` returns it); with text alone it is the old hidden image.
 */
function matchBody(body: ArticleBlock[], cover: ImageConfig | undefined, cta: SectionCta | undefined): ClassicFields | undefined {
  const [first, second] = body;
  if (body.length === 1 && first.type === 'text') {
    return matchText(first, (html, contentI18n) => classicFields(html, ViewPosition.None, { images: cover ? [cover] : [], cta, contentI18n }));
  }
  if (body.length === 1 && first.type === 'columns') return matchColumns(first, cta);
  if (body.length !== 2) return undefined;
  if (second.type === 'text') return matchImages(first, second, ViewPosition.Top, cta);
  return first.type === 'text' ? matchImages(second, first, ViewPosition.Bottom, cta) : undefined;
}

function matchText(text: TextBlock, build: (html: string, i18n: I18nString | undefined) => ClassicFields | undefined): ClassicFields | undefined {
  return isAligned(text) ? undefined : build(typeof text.html === 'string' ? text.html : '', validI18n(text.htmlI18n));
}

function matchImages(block: ArticleBlock, text: TextBlock, position: ViewPosition.Top | ViewPosition.Bottom, cta: SectionCta | undefined): ClassicFields | undefined {
  return matchText(text, (html, contentI18n) => {
    if (block.type === 'image') {
      return isObject(block.image) ? classicFields(html, position, { images: [block.image], imageStyle: block.imageStyle, cta, contentI18n }) : undefined;
    }
    if (block.type !== 'gallery') return undefined;
    const images = validImages(block.images);
    // today several images without a layout are always on top
    const placed = articleImagePosition(position, images.length, block.layout) === position;
    if (!placed || !isGallery(images.length, block.layout, block.slideshow, position)) return undefined;
    return classicFields(html, position, {
      images, imageStyle: block.imageStyle, imageLayout: block.layout, slideshow: block.slideshow, cta, contentI18n,
    });
  });
}

function matchColumns(block: ColumnsBlock, cta: SectionCta | undefined): ClassicFields | undefined {
  const columns = columnsOf(block);
  if (block.stackReverse || columns.length !== 2 || columns.some((c) => c.blocks.length !== 1 || !isColSize(c.size))) return undefined;
  const [[left], [right]] = [columns[0].blocks, columns[1].blocks];
  if (columns[0].size + columns[1].size !== 12) return undefined;
  if (left.type === 'image' && right.type === 'text') return matchBeside(left, right, ViewPosition.Left, columns[0].size, cta);
  if (left.type === 'text' && right.type === 'image') return matchBeside(right, left, ViewPosition.Right, columns[1].size, cta);
  return undefined;
}

function matchBeside(image: ImageBlock, text: TextBlock, position: ViewPosition, colSize: number, cta: SectionCta | undefined): ClassicFields | undefined {
  if (!isObject(image.image)) return undefined;
  return matchText(text, (html, contentI18n) =>
    classicFields(html, position, { images: [image.image], imageStyle: image.imageStyle, cta, contentI18n }, colSize));
}

// ------------------------------------------------- is it exact? ------------------------------------------------

/** What decides how an article without `blocks` is drawn (spec 1.173 §11 step 1): two articles with equal values look the same. */
export interface DrawnArticle {
  html: string;
  i18n?: I18nString;
  images: ImageConfig[];
  imageStyle?: ArticleConfig['imageStyle'];
  layout?: string;
  slideshow?: ArticleSlideshow;
  position: ViewPosition;
  colSize?: number;
  cta?: SectionCta;
}

export function drawnArticle(s: ArticleLike): DrawnArticle {
  const p = configOf(s);
  const n = p.images?.length ?? 0;
  const position = articleImagePosition(s.content?.position, n, p.imageLayout);
  const shown = position !== ViewPosition.None;                    // a full imageStyle is stored even without images
  const side = n === 1 && (position === ViewPosition.Left || position === ViewPosition.Right);
  return {
    html: s.content?.htmlContent ?? '', i18n: p.contentI18n, images: p.images ?? [], imageStyle: shown ? p.imageStyle : undefined,
    layout: n > 1 || (n === 1 && p.imageLayout === SIDE_BY_SIDE_LAYOUT) ? p.imageLayout : undefined,
    slideshow: shown && isSlideshowActive(p.slideshow, p.imageLayout) ? p.slideshow : undefined,
    position, colSize: side ? (s.content?.colSize ?? DEFAULT_COL_SIZE) : undefined, cta: p.cta,
  };
}

/** Equal stored values; a property that is undefined equals one that is absent. */
export function isSameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => isSameValue(value, b[i]));
  if (!isObject(a) || !isObject(b)) return Object.is(a, b);
  const [left, right] = [a as Record<string, unknown>, b as Record<string, unknown>];
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every((key) => isSameValue(left[key], right[key]));
}

/**
 * Whether an article without `blocks` may be converted with `blocksFromClassic`: converted there and back it is drawn the
 * same, it stays classic, and all its images have a url (see `blocksFromClassic`). Otherwise it stays an old article.
 * False for an article that has blocks, and for any other section.
 */
export function convertsExactly(s: ArticleLike): boolean {
  if ((s.type && s.type !== 'article') || articleBlocksOf(s)) return false;
  const stored: unknown = configOf(s).images ?? [];
  if (!Array.isArray(stored) || !stored.every((i) => isObject(i) && hasUrl(i))) return false;
  const converted: ArticleLike = { ...s, content: undefined, properties: blocksFromClassic(s) };
  return !isFreeArticle(converted) && isSameValue(drawnArticle(withClassicFields(converted)), drawnArticle(s));
}

function hasUrl(image: { url?: unknown }): boolean {
  return typeof image.url === 'string' && image.url.trim() !== '';
}
