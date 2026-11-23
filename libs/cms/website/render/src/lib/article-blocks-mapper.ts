import { articleBlocksOf, type BlockAlign, type CalloutTone, type SpaceSize } from '@okr/shared-models';

import {
  articleImageHeight, articleSideBySide, articleStacked, mapCta, mapImage, mapImages, mapSlideshow, pickText, str,
  type I18nString, type PublicCta, type PublicImage, type SanitizeFn, type SectionDoc, type StoredImage, type StoredImageStyle, type WebSlideshow,
} from './section-mapper';

/**
 * The blocks of a free article as the website draws them (spec 1.173 §7, §9.3): html sanitized and in the page language,
 * images mapped, urls checked. Stored blocks may be malformed or of a type this version does not know: what cannot be
 * drawn is left out, so a template needs no checks and a publish never fails because of a block (§13). The app's twin is
 * `articleBlockViews` (@okr/cms-section-util), which this lib cannot import.
 *
 * `albumOffset`: the place of the block's first image in the article's album (`mapBlocks().images`).
 */
export type PublicBlock =
  | { type: 'text'; html: string; align: BlockAlign }
  | { type: 'callout'; html: string; tone: CalloutTone }
  | { type: 'image'; image: PublicImage; imageHeight: number; albumOffset: number }
  | { type: 'gallery'; layout: 'slider' | 'row' | 'column' | 'slideshow'; images: PublicImage[]; imageHeight: number; albumOffset: number; slideshow?: WebSlideshow }
  | { type: 'button'; cta: PublicCta; align: BlockAlign }
  /** `cols`: the sizes as a css `grid-template-columns`, e.g. '4fr 8fr' */
  | { type: 'columns'; columns: { size: number; blocks: PublicBlock[] }[]; stackReverse: boolean; cols: string }
  | { type: 'divider' }
  | { type: 'space'; size: SpaceSize };

type Loose = Record<string, unknown>;

const ALIGNS: readonly BlockAlign[] = ['left', 'center', 'right'];
const TONES: readonly CalloutTone[] = ['primary', 'secondary', 'tertiary', 'neutral'];
const SPACES: readonly SpaceSize[] = ['small', 'medium', 'large'];
/** What a column may hold. */
const IN_COLUMN: readonly unknown[] = ['text', 'image', 'button'];

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? value as T : fallback;
}

/** Neither text nor a picture. */
function isEmptyHtml(html: string): boolean {
  return !/<img\b/i.test(html) && html.replace(/<[^>]*>|&nbsp;|\s/g, '') === '';
}

/** Whether a stored image has a url, has none yet, or is no image. */
function imageState(value: unknown): 'ok' | 'empty' | 'malformed' {
  if (!isObject(value)) return 'malformed';
  const url = value['url'] ?? '';
  if (typeof url !== 'string') return 'malformed';
  return url.trim() === '' ? 'empty' : 'ok';
}

/** The stored sizes when they fill the 12 columns, else equal ones. */
function columnSizes(sizes: unknown[]): number[] {
  const valid = sizes.length >= 2 && sizes.length <= 3
    && sizes.every((n) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 11)
    && (sizes as number[]).reduce((sum, n) => sum + n, 0) === 12;
  return valid ? sizes as number[] : sizes.map(() => Math.max(1, Math.floor(12 / sizes.length)));
}

/** Maps the blocks of one article in one language and collects its album. */
class BlockMapper {
  public readonly images: PublicImage[] = [];

  constructor(
    private readonly sanitize: SanitizeFn,
    private readonly lang: string,
    private readonly captions: string[],
    private readonly sectionId: string,
  ) {}

  public blocks(value: unknown, inColumn = false): PublicBlock[] {
    return (Array.isArray(value) ? value : [])
      .map((block: unknown, index) => this.safeBlock(block, index, inColumn))
      .filter((b): b is PublicBlock => b !== undefined);
  }

  private safeBlock(block: unknown, index: number, inColumn: boolean): PublicBlock | undefined {
    const albumLength = this.images.length;
    const leftOut = (reason: string): undefined => {
      // stored values: quoted, so that they cannot break out of the log line
      const id = isObject(block) && typeof block['id'] === 'string' ? JSON.stringify(block['id']) : `#${index}`;
      console.warn(`article ${JSON.stringify(this.sectionId)}: block ${id} left out (${reason})`);
      return undefined;
    };
    if (!isObject(block) || typeof block['type'] !== 'string') return leftOut('no block');
    const type = block['type'];
    if (inColumn && !IN_COLUMN.includes(type)) return leftOut(`type ${JSON.stringify(type)} in a column`);
    try {
      const mapped = this.block(type, block);
      return mapped === 'malformed' ? leftOut(`malformed or unknown ${JSON.stringify(type)}`) : mapped;
    } catch (e) {
      this.images.length = albumLength;
      return leftOut(e instanceof Error ? e.message : String(e));
    }
  }

  /** undefined: nothing to draw; 'malformed': worth a warning */
  private block(type: string, block: Loose): PublicBlock | 'malformed' | undefined {
    switch (type) {
      case 'text': {
        const html = this.html(block);
        return html === undefined || html === 'malformed' ? html : { type, html: html.html, align: oneOf(block['align'], ALIGNS, 'left') };
      }
      case 'callout': {
        const html = this.html(block);
        return html === undefined || html === 'malformed' ? html : { type, html: html.html, tone: oneOf(block['tone'], TONES, 'neutral') };
      }
      case 'image': return this.image(block);
      case 'gallery': return this.gallery(block);
      case 'button': return this.button(block);
      case 'columns': return this.columns(block);
      case 'divider': return { type };
      case 'space': return { type, size: oneOf(block['size'], SPACES, 'medium') };
      default: return 'malformed';
    }
  }

  private html(block: Loose): { html: string } | 'malformed' | undefined {
    const plain = typeof block['html'] === 'string' ? block['html'] : undefined;
    // an empty translation is none
    const translations = isObject(block['htmlI18n']) ? block['htmlI18n'] : {};
    const i18n = Object.fromEntries(Object.entries(translations).filter(([, text]) => str(text).trim() !== '')) as I18nString;
    const text = pickText(plain, i18n, this.lang);
    if (plain === undefined && !text) return 'malformed';
    const html = this.sanitize(text);
    return isEmptyHtml(html) ? undefined : { html };
  }

  private image(block: Loose): PublicBlock | 'malformed' | undefined {
    const state = imageState(block['image']);
    if (state !== 'ok') return state === 'malformed' ? state : undefined;
    const style = this.imageStyle(block);
    const image = mapImage(block['image'] as StoredImage, style, this.captions);
    return image && { type: 'image', image, imageHeight: articleImageHeight(style), albumOffset: this.addToAlbum([image]) };
  }

  private gallery(block: Loose): PublicBlock | 'malformed' | undefined {
    if (!Array.isArray(block['images'])) return 'malformed';
    const stored: unknown[] = block['images'];
    const raw = stored.filter((image) => imageState(image) === 'ok') as StoredImage[];
    if (raw.length === 0) return stored.some((image) => imageState(image) === 'malformed') ? 'malformed' : undefined;

    const style = this.imageStyle(block);
    const layout = str(block['layout']) || undefined;
    const row = articleSideBySide(raw, layout, undefined, style);
    const column = articleStacked(raw, layout, undefined, style, this.captions);
    const slideshow = mapSlideshow(block['slideshow'], layout, raw);
    const images = (row ?? column)?.images ?? mapImages(raw, style, this.captions);
    return {
      type: 'gallery',
      layout: row ? 'row' : column ? 'column' : slideshow ? 'slideshow' : 'slider',
      images,
      imageHeight: column ? 0 : articleImageHeight(style),
      albumOffset: this.addToAlbum(images),
      ...(slideshow ? { slideshow } : {}),
    };
  }

  private button(block: Loose): PublicBlock | 'malformed' | undefined {
    const stored = block['cta'];
    if (!isObject(stored)) return 'malformed';
    const cta = mapCta(stored, this.lang);
    if (cta) return { type: 'button', cta, align: oneOf(block['align'], ALIGNS, 'left') };
    // half filled in is not malformed, an unusable url is
    return str(stored['label']).trim() === '' || str(stored['url']).trim() === '' ? undefined : 'malformed';
  }

  private columns(block: Loose): PublicBlock | 'malformed' | undefined {
    const stored = Array.isArray(block['columns']) ? block['columns'].filter(isObject) : [];
    if (stored.length === 0) return 'malformed';
    const sizes = columnSizes(stored.map((column) => column['size']));
    const columns = stored.map((column, i) => ({ size: sizes[i], blocks: this.blocks(column['blocks'], true) }));
    if (columns.every((column) => column.blocks.length === 0)) return undefined;
    return { type: 'columns', columns, stackReverse: block['stackReverse'] === true, cols: sizes.map((size) => `${size}fr`).join(' ') };
  }

  private imageStyle(block: Loose): StoredImageStyle | undefined {
    // a stored style is a partial one; every reader copes with absent fields
    return isObject(block['imageStyle']) ? block['imageStyle'] as unknown as StoredImageStyle : undefined;
  }

  private addToAlbum(images: PublicImage[]): number {
    const offset = this.images.length;
    this.images.push(...images);
    return offset;
  }
}

/**
 * The blocks of an article and its album: every image that the blocks draw, in reading order. The `cover` is not drawn,
 * so it is not in the album. `id` names the section in a warning.
 */
export function mapBlocks(s: SectionDoc, sanitize: SanitizeFn, lang: string, id?: string): { blocks: PublicBlock[]; images: PublicImage[] } {
  const props = s.properties ?? {};
  const title = pickText(s.title, props.titleI18n, lang);
  const subTitle = pickText(s.subTitle, props.subTitleI18n, lang);
  const mapper = new BlockMapper(sanitize, lang, [subTitle, title], id ?? str(s.name));
  // the stored list, not articleBlocksOf(): the entries that are no blocks are worth a warning, too
  const blocks = mapper.blocks(articleBlocksOf(s) ? props['blocks'] : undefined);
  return { blocks, images: mapper.images };
}
