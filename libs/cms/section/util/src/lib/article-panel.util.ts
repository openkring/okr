import { SLIDESHOW_EFFECTS, articleBlocksOf, blockImages, type ArticleBlock, type ArticleColumn, type ArticleSection, type ImageConfig, type MailBlock, type MailBlockType, type SectionModel } from '@okr/shared-models';
import { resolveImageStyle, sanitizeFileName, suffixFileName } from '@okr/shared-util-core';

import { hasImageUrl, isObject, type Loose } from './article-block.util';
import { findBlock, replaceBlock } from './article-editor.util';
import { ARTICLE_PROFILE, type EditorProfile } from './editor-profile';
import { resolveImageLayout } from './image-layout.util';
import { ARTICLE_IMAGES_SEGMENT_FIELDS, type SectionErrorEntry, type SectionErrors } from './section-errors';
import { SLIDESHOW_DURATION_MAX, SLIDESHOW_DURATION_MIN, SLIDESHOW_INTERVAL_MAX, SLIDESHOW_INTERVAL_MIN } from './slideshow.util';

export { BLOCK_ALIGNS, CALLOUT_TONES, SPACE_SIZES } from './article-block.util';

/**
 * What the side panel of the article editor works out (spec 1.175 §7.3, §7.6). All functions are pure and never mutate;
 * stored blocks may be malformed and nothing here throws on them.
 */

/** The icon of each block type of an article or a mail, for `svgIcon`. */
export const ARTICLE_BLOCK_ICONS: Record<MailBlockType, string> = {
  text: 'text', image: 'image', gallery: 'images', button: 'button', columns: 'grid', callout: 'info-circle', divider: 'remove', space: 'swap-vertical',
  events: 'calendar',
};

// ------------------------------------------------------- pictures -------------------------------------------------------

/** A storage name that no other upload has: `bild.jpg`, `ab12` → `bild-ab12.jpg`. The name is made safe for a url; the extension stays. */
export function uniqueFileName(name: string, id: string): string {
  const safe = name.trim() === '' ? 'file' : sanitizeFileName(name);
  return suffixFileName(safe.startsWith('.') ? `file${safe}` : safe, id);
}

/** «Aus diesem Artikel»: the pictures of the blocks in reading order, then the teaser picture, each url once. */
export function articleImageChoices(section: ArticleSection): ImageConfig[] {
  const cover: unknown = section.properties?.cover;
  const images = [...blockImages(articleBlocksOf(section) ?? []), ...(isObject(cover) ? [cover as unknown as ImageConfig] : [])];
  const seen = new Set<string>();
  return images.filter((image) => {
    const url = typeof image.url === 'string' ? image.url.trim() : '';
    if (url === '' || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/** An image or gallery block without a picture: readers see nothing of it. */
export function isPictureMissing(block: MailBlock): boolean {
  if (block.type === 'image') return !hasImageUrl(block.image);
  return block.type === 'gallery' && !(Array.isArray(block.images) && block.images.some(hasImageUrl));
}

/** The entries of a stored picture list that can be drawn and edited; anything else is no picture. */
export function drawableImages(images: unknown): ImageConfig[] {
  return (Array.isArray(images) ? images : []).filter((image) => isObject(image) && (image['url'] === undefined || image['url'] === null || typeof image['url'] === 'string')) as ImageConfig[];
}

/** What is found out about an uploaded picture after it was added: its document and the attribution in the file. */
export interface ImageDetails { url: string; documentKey?: string; credit?: string }

/** Who takes uploaded pictures, see `uploadTarget` of `okr-images-config`. It may be called after that component is gone. */
export interface ImageUploadTarget {
  added(images: ImageConfig[]): void;
  details(details: ImageDetails[]): void;
}

/** A result of an upload in the panel. It may arrive when another block is selected or the block is gone; see `withUpload`. */
export type ArticleUpload =
  | { kind: 'images'; place: { blockId: string } | 'cover'; images: ImageConfig[] }
  | { kind: 'details'; details: ImageDetails[] };

/** The section with the upload in it; the same object when it changes nothing (the block is gone, the picture is not used). */
export function withUpload(section: ArticleSection, upload: ArticleUpload): ArticleSection {
  if (upload.kind === 'details') return withImageDetails(section, upload.details);
  const { place, images } = upload;
  if (images.length === 0) return section;
  if (place === 'cover') return { ...section, properties: { ...section.properties, cover: images[0] } };
  const blocks = section.properties?.blocks;
  if (!Array.isArray(blocks)) return section;
  const block = findBlock(blocks, place.blockId)?.block;
  let next: ArticleBlock;
  if (block?.type === 'image') {
    // the link belongs to the place in the article; title, caption and source belong to the old picture
    const actionUrl = isObject(block.image) ? block.image.actionUrl : '';
    next = { ...block, image: { ...images[0], actionUrl: actionUrl || images[0].actionUrl } };
  } else if (block?.type === 'gallery') {
    next = { ...block, images: [...drawableImages(block.images), ...images] };
  } else return section;
  return { ...section, properties: { ...section.properties, blocks: replaceBlock(blocks, next) } };
}

/** Adds document and attribution to every picture with that url; a value that is set already stays. */
function withImageDetails(section: ArticleSection, details: ImageDetails[]): ArticleSection {
  const byUrl = new Map(details.map((d) => [d.url, d]));
  const image = <T>(value: T): T => {
    const d = isObject(value) && typeof value['url'] === 'string' ? byUrl.get(value['url']) : undefined;
    if (!d) return value;
    const old = value as Loose;
    const documentKey = old['documentKey'] || d.documentKey;
    const credit = old['credit'] || d.credit;
    if ((!documentKey || documentKey === old['documentKey']) && (!credit || credit === old['credit'])) return value;
    return { ...old, ...(documentKey ? { documentKey } : {}), ...(credit ? { credit } : {}) } as T;
  };
  const list = <T>(items: T[], change: (item: T) => T): T[] => {
    const next = items.map(change);
    return next.every((item, i) => item === items[i]) ? items : next;
  };
  const block = (value: ArticleBlock): ArticleBlock => {
    if (!isObject(value)) return value;
    if (value.type === 'image') {
      const next = image(value.image);
      return next === value.image ? value : { ...value, image: next };
    }
    if (value.type === 'gallery' && Array.isArray(value.images)) {
      const next = list(value.images, image);
      return next === value.images ? value : { ...value, images: next };
    }
    if (value.type === 'columns' && Array.isArray(value.columns)) {
      const next = list(value.columns, (column): ArticleColumn => {
        if (!isObject(column) || !Array.isArray(column.blocks)) return column;
        const blocks = list(column.blocks as ArticleBlock[], block);
        return blocks === column.blocks ? column : { ...column, blocks: blocks as ArticleColumn['blocks'] };
      });
      return next === value.columns ? value : { ...value, columns: next };
    }
    return value;
  };
  const { blocks, cover } = section.properties ?? {};
  const nextBlocks = Array.isArray(blocks) ? list(blocks, block) : blocks;
  const nextCover = image(cover);
  if (nextBlocks === blocks && nextCover === cover) return section;
  return { ...section, properties: { ...section.properties, ...(nextBlocks ? { blocks: nextBlocks } : {}), ...(nextCover ? { cover: nextCover } : {}) } };
}

// ------------------------------------------------------- columns -------------------------------------------------------

/**
 * The widths (of 12) after column `index` got `size`: the neighbour gives or takes (the next one, for the last column the one before),
 * then the others. All stay 1 to 11 with the sum 12; the same array when that is not possible.
 */
export function resizeColumn(sizes: number[], index: number, size: number): number[] {
  const valid = sizes.length > 1 && sizes.every((s) => Number.isInteger(s) && s >= 1) && sizes.reduce((sum, s) => sum + s, 0) === 12;
  if (!valid || index < 0 || index >= sizes.length || !Number.isInteger(size) || size < 1 || size > 12 - (sizes.length - 1)) return sizes;
  const out = [...sizes];
  let rest = out[index] - size;    // what the others get; negative: what they give
  out[index] = size;
  const others = [...sizes.keys()].filter((i) => i !== index);
  for (const i of [...others.filter((o) => o > index), ...others.filter((o) => o < index).reverse()]) {
    const change = Math.max(rest, 1 - out[i]);
    out[i] += change;
    rest -= change;
  }
  return rest === 0 ? out : sizes;
}

// ------------------------------------------------------- undo steps -------------------------------------------------------

/** The fields of the panel one types into. Everything else is chosen: each choice is a step of its own. */
const TYPED_FIELDS: readonly string[] = [
  'title', 'subTitle', 'intro', 'name', 'notes', 'background', 'label', 'url', 'altText', 'overlay', 'actionUrl', 'credit',
  'width', 'height', 'border', 'borderRadius', 'imgIxParams', 'captionSize', 'interval', 'duration', 'maxEvents',
];

function leaves(value: unknown, path: string, out: Map<string, unknown>): Map<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    for (const [key, v] of Object.entries(value)) leaves(v, path === '' ? key : `${path}.${key}`, out);
  } else if (value !== undefined) out.set(path, value);
  return out;
}

/**
 * The path of the one typed field in which two versions of a block or a section differ, else undefined. A run of typing in one
 * field of the panel is one undo step: use it as the tag of `record`, together with the id of the block. In a mail the action of a picture
 * comes with its link (`withMailLinks`), and the width of a picture is chosen.
 */
export function typingPath(before: unknown, after: unknown, profile: EditorProfile = ARTICLE_PROFILE): string | undefined {
  const [a, b] = [leaves(before, '', new Map()), leaves(after, '', new Map())];
  const all = [...new Set([...a.keys(), ...b.keys()])].filter((path) => a.get(path) !== b.get(path));
  const changed = all.some((path) => path.endsWith('.actionUrl')) ? all.filter((path) => path !== 'imageStyle.action') : all;
  if (changed.length !== 1 || (profile.kind === 'mail' && changed[0] === 'imageStyle.width')) return undefined;
  return TYPED_FIELDS.includes(changed[0].split('.').pop() as string) ? changed[0] : undefined;
}

// ------------------------------------------------------- errors and translations -------------------------------------------------------

/**
 * The error names that the panel of this block shows at a field **as it is drawn now** (see `restErrors`): okr-image-style draws the slot
 * only for a thumbnail, the look card needs a picture, the times of a slideshow need a
 * running one. A picture of a mail has no look card, only its width. Names as `blockErrors` and `galleryErrors` give them.
 */
export function shownBlockFields(block: MailBlock, profile: EditorProfile = ARTICLE_PROFILE, inColumn = false): string[] {
  switch (block.type) {
    case 'text': return ['align', 'html'];
    case 'callout': return ['tone', 'html'];
    case 'button': return ['align', 'cta.label', 'cta.url'];
    case 'columns': return ['columns'];
    case 'space': return ['size'];
    // whatever concerns the picture stands under the list of one, at its field or in the note that there is none
    case 'image': {
      const style = profile.imageAction === 'link' ? ['width', 'imageStyle.width'] : shownStyleFields(block.imageStyle);
      return ['images[', 'image.', ...(isPictureMissing(block) ? [] : style)];
    }
    case 'gallery': {
      const images = drawableImages(block.images);
      if (images.length === 0 || profile.galleryPairs) return ['images', 'images['];
      const slider = resolveImageLayout(block.layout, images.length) === 'slider';
      const slideshow = !slider ? [] : isObject(block.slideshow) ? ['slideshow.'] : ['slideshow.effect'];
      return ['images', 'images[', 'imageLayout', ...slideshow, ...shownStyleFields(block.imageStyle)];
    }
    case 'events': return isEventsShown(profile, inColumn) ? ['calendarKey', 'title', 'maxEvents'] : [];
    default: return [];
  }
}

/** Events are a block of a mail's top level; anywhere else they are unknown. */
export function isEventsShown(profile: EditorProfile, inColumn: boolean): boolean {
  return (inColumn ? profile.columnTypes as readonly string[] : profile.types).includes('events');
}

function shownStyleFields(stored: unknown): string[] {
  const style = resolveImageStyle(isObject(stored) ? stored : undefined);
  const fields = ['action', ...ARTICLE_IMAGES_SEGMENT_FIELDS.styles.filter((field) => field !== 'slot' || style.isThumbnail)];
  return fields.flatMap((field) => [field, `imageStyle.${field}`]);
}

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * Which optional parts of a section are in use. `okr-section-config` draws by it: subtitle, intro (with the choice of its place) and an
 * article's background (with its text colour). The panel decides by it which errors stand at a field.
 */
export function articleUses(section: SectionModel): { subTitle: boolean; intro: boolean; background: boolean } {
  return {
    subTitle: filled(section.subTitle), intro: filled(section.intro),
    background: section.type === 'article' && filled(section.properties?.background),
  };
}

/** The error names that the panel of the article shows at a field: an unused optional part and what a role does not see are not drawn. */
export function shownArticleFields(section: ArticleSection, may: { admin: boolean; privileged: boolean }): string[] {
  const uses = articleUses(section);
  return [
    'title', 'name', 'cover.',
    ...(uses.subTitle ? ['subTitle'] : []), ...(uses.intro ? ['intro', 'introPosition'] : []), ...(uses.background ? ['background', 'textColor'] : []),
    ...(may.privileged ? ['tags'] : []), ...(may.admin ? ['notes'] : []),
  ];
}

const isShown = (field: string, shown: readonly string[]): boolean =>
  shown.some((s) => (s.endsWith('[') || s.endsWith('.') ? field.startsWith(s) : s === field));

/** The errors of these fields, named as for `restErrors`. Fields given only these never repeat what is in the list of the others. */
export function pickErrors(errors: SectionErrors | undefined, shown: readonly string[]): SectionErrors {
  return Object.fromEntries(Object.entries(errors ?? {}).filter(([field, messages]) => messages?.length > 0 && isShown(field, shown)));
}

/**
 * The errors that no field of the panel shows. `shown`: field names; a name that ends in `[` or `.` stands for all that start with it.
 * An error of an image style is there under two names (`blockErrors`) and is listed once.
 */
export function restErrors(errors: SectionErrors | undefined, shown: readonly string[]): SectionErrorEntry[] {
  const isAlias = (field: string) => field.startsWith('imageStyle.') && (errors?.[field.slice('imageStyle.'.length)]?.length ?? 0) > 0;
  return Object.entries(errors ?? {}).filter(([field, messages]) => messages?.length > 0 && !isShown(field, shown) && !isAlias(field)).map(([field, messages]) => ({ field, messages }));
}

/** The errors of the teaser picture (`cover.url`) as an image list names them (`images[0].url`). */
export function coverErrors(errors: SectionErrors | undefined): SectionErrors {
  const prefix = 'cover.';
  return Object.fromEntries(Object.entries(errors ?? {}).filter(([key]) => key.startsWith(prefix)).map(([key, messages]) => [`images[0].${key.slice(prefix.length)}`, messages]));
}

/**
 * The errors of a gallery as `okr-article-images-config` names them: `layout` is its `imageLayout`, and the one error of a
 * slideshow stands at each of its fields that is wrong.
 */
export function galleryErrors(errors: SectionErrors | undefined, block: MailBlock): SectionErrors {
  const { layout, slideshow, ...others } = errors ?? {};
  const out: SectionErrors = { ...others, ...(layout?.length ? { imageLayout: layout } : {}) };
  if (!slideshow?.length) return out;
  const show: unknown = block.type === 'gallery' ? block.slideshow : undefined;
  if (!isObject(show)) return { ...out, slideshow };
  const outside = (value: unknown, min: number, max: number) => !(typeof value === 'number' && value >= min && value <= max);
  if (!(SLIDESHOW_EFFECTS as readonly unknown[]).includes(show['effect'])) out['slideshow.effect'] = slideshow;
  if (outside(show['interval'], SLIDESHOW_INTERVAL_MIN, SLIDESHOW_INTERVAL_MAX)) out['slideshow.interval'] = slideshow;
  if (outside(show['duration'], SLIDESHOW_DURATION_MIN, SLIDESHOW_DURATION_MAX)) out['slideshow.duration'] = slideshow;
  return out;
}

/** The languages in which a block's translation is outdated, from the result of `outdatedPaths`. */
export function outdatedLanguagesOf(paths: Record<string, string[]>, blockId: string): string[] {
  const own = Object.entries(paths).filter(([path]) => path === `blocks.${blockId}.htmlI18n` || path === `blocks.${blockId}.cta.labelI18n`);
  return [...new Set(own.flatMap(([, languages]) => languages))];
}
