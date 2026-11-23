import {
  ARTICLE_BLOCK_TYPES, EDITOR_CONFIG_SHAPE, ViewPosition, articleBlocksOf, blocksFromClassic, convertsExactly, isSameValue,
  type ArticleBlock, type ArticleConfig, type ArticleSection, type I18nMeta, type I18nString, type SectionModel,
} from '@okr/shared-models';

import { isObject, type Loose } from './article-block.util';
import { blocksInOrder, createBlock, type NewId } from './article-editor.util';

/**
 * Opening an article for the block editor, telling whether it changed, and preparing its save (spec 1.175 §7.8, §7.9, §8, §10).
 * All functions are pure and never mutate their input; stored data may be malformed and nothing here throws on it.
 */

/** `noPicture`: images without url were left out. `look`: the article does not convert exactly (§8 step 2). */
export type ArticleOpenNotice = 'noPicture' | 'look';

const asObject = (value: unknown): Loose => (isObject(value) ? value : {});
const isKnownType = (type: unknown): boolean => (ARTICLE_BLOCK_TYPES as readonly unknown[]).includes(type);
const hasUrl = (image: unknown): boolean => isObject(image) && typeof image['url'] === 'string' && image['url'].trim() !== '';

// ------------------------------------------------------- opening -------------------------------------------------------

/** Ids: the first block keeps its id, a missing, empty or repeated one gets a new id. Inner blocks are numbered after their columns block. */
function normalise(blocks: unknown[], newId: NewId): ArticleBlock[] {
  const used = new Set<string>();
  const freshId = (): string => {
    for (let i = 0; i < 1000; i++) {
      const id = newId();
      if (!used.has(id)) return id;
    }
    throw new Error('newId does not return new ids');
  };
  const clean = (value: Loose): ArticleBlock => {
    const id = typeof value['id'] === 'string' && value['id'] !== '' && !used.has(value['id']) ? value['id'] : freshId();
    used.add(id);
    let block: Loose = id === value['id'] ? value : { ...value, id };
    if (!isKnownType(block['type'])) return block as unknown as ArticleBlock;
    block = withoutGermanTranslation(block);
    if (Array.isArray(block['columns'])) {
      block = { ...block, columns: block['columns'].map((col: unknown) =>
        isObject(col) && Array.isArray(col['blocks']) ? { ...col, blocks: col['blocks'].filter(isObject).map(clean) } : col) };
    }
    return block as unknown as ArticleBlock;
  };
  return blocks.filter(isObject).map(clean);
}

/** `htmlI18n.de` becomes the German text when that is empty (the website shows it); it never stays (§10). */
function withoutGermanTranslation(block: Loose): Loose {
  const i18n = block['htmlI18n'];
  if (!isObject(i18n) || !('de' in i18n)) return block;
  const { de, ...others } = i18n;
  const html = typeof block['html'] === 'string' && block['html'] !== '' ? block['html'] : typeof de === 'string' ? de : block['html'];
  const { htmlI18n: _old, ...rest } = block;
  return { ...rest, ...(html === undefined ? {} : { html }), ...(Object.keys(others).length > 0 ? { htmlI18n: others } : {}) };
}

/** The section with `content` and `properties` present (`createMissingSection` passes neither). */
function withShapes(section: ArticleSection): ArticleSection {
  return {
    ...section,
    content: isObject(section.content) ? section.content : { ...EDITOR_CONFIG_SHAPE, htmlContent: '', position: ViewPosition.None },
    properties: isObject(section.properties) ? section.properties : { images: [] },
  } as ArticleSection;
}

/**
 * The article as the editor starts with it. Without `blocks` they are made from the old fields (§8): images without url are
 * left out first. The result is the baseline of `isArticleChanged`. Old fields stay as they are (§7.9).
 */
export function openArticle(section: ArticleSection, newId: NewId): { section: ArticleSection; notice?: ArticleOpenNotice } {
  const shaped = withShapes(section);
  const existing = articleBlocksOf(shaped);
  if (existing) {
    const blocks = normalise(shaped.properties.blocks as unknown[], newId);
    return { section: { ...shaped, properties: { ...shaped.properties, blocks } } };
  }
  const stored = Array.isArray(shaped.properties.images) ? shaped.properties.images : [];
  const kept = stored.filter(hasUrl);
  const removed = kept.length !== stored.length;
  const converted = blocksFromClassic({ ...shaped, properties: { ...shaped.properties, images: kept } });
  const blocks = normalise(converted.blocks, newId);
  const properties: ArticleConfig = { ...shaped.properties, blocks, ...(converted.cover ? { cover: converted.cover } : {}) };
  const notice: ArticleOpenNotice | undefined = removed ? 'noPicture' : convertsExactly(shaped) ? undefined : 'look';
  return { section: { ...shaped, properties }, ...(notice ? { notice } : {}) };
}

/** A new article for the editor: one empty text block. */
export function newArticleForEditor(section: ArticleSection, okey: string, newId: NewId): ArticleSection {
  const shaped = withShapes(section);
  return { ...shaped, okey, properties: { ...shaped.properties, blocks: [createBlock('text', newId)] } };
}

/**
 * A block article from one with the old fields, for the writers that create articles (§12): the same conversion as
 * `openArticle` without a notice and without changing anything else. An article that has blocks is returned as it is.
 */
export function articleWithBlocks(section: ArticleSection): ArticleSection {
  if (articleBlocksOf(section)) return section;
  const shaped = withShapes(section);
  const converted = blocksFromClassic(shaped);
  return { ...shaped, properties: { ...shaped.properties, blocks: normalise(converted.blocks, () => 'block'), ...(converted.cover ? { cover: converted.cover } : {}) } };
}

// ------------------------------------------------------- comparing -------------------------------------------------------

const COMPARED_FIELDS = [
  'type', 'state', 'name', 'title', 'subTitle', 'intro', 'introPosition', 'color', 'colSize', 'roleNeeded', 'isArchived',
  'content', 'properties', 'notes', 'tags',
] as const;
/** Fields whose values are compared by `isSameValue` only: an empty object is something. */
const DEEP_FIELDS: readonly string[] = ['content', 'properties'];

/** Absent, undefined, null, '' and [] are one value at field level. */
function normalisedField(value: unknown): unknown {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value;
}

function sameFields(a: object, b: object): boolean {
  const [left, right] = [a as Loose, b as Loose];
  return COMPARED_FIELDS.every((key) => DEEP_FIELDS.includes(key)
    ? isSameValue(left[key], right[key])
    : isSameValue(normalisedField(left[key]), normalisedField(right[key])));
}

/** Whether the editor's state differs from the article as opened. `index`, `tenants` and `okey` do not count. */
export function isArticleChanged(opened: ArticleSection, current: ArticleSection): boolean {
  return !sameFields(opened, current);
}

/**
 * Whether the document read again from the server differs from the section as it was read when the editor opened
 * (`loaded`, a plain object without model defaults). Compares what the editor can change.
 */
export function changedMeanwhile(loaded: SectionModel, stored: object): boolean {
  return !sameFields(loaded, stored);
}

// ------------------------------------------------------- hashing -------------------------------------------------------

const EMPTY_PARAGRAPH = /<p>\s*(<br\s*\/?>)?\s*<\/p>/gi;

/** Trim, collapse whitespace and drop empty paragraphs, so that a save that only touches whitespace changes nothing. */
function normalisedGerman(text: string): string {
  return text.replace(EMPTY_PARAGRAPH, '').replace(/\s+/g, ' ').trim();
}

/** The first 16 hex characters of the SHA-256 of the normalised German text (1.161 §3.1). */
export async function germanHash(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalisedGerman(text)));
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------- translations -------------------------------------------------------

/** One German text that may have translations: its path (§10), the block it belongs to, the German and the stored translations. */
interface Field { path: string; blockId?: string; suffix: string; german: string; i18n: I18nString }

const asI18n = (value: unknown): I18nString => (isObject(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as I18nString : {});
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

function fieldsOf(section: ArticleSection): Field[] {
  const s = section as unknown as Loose;
  const p = asObject(s['properties']);
  const header = (key: 'title' | 'subTitle' | 'intro'): Field =>
    ({ path: `${key}I18n`, suffix: `${key}I18n`, german: asText(s[key]), i18n: asI18n(p[`${key}I18n`]) });
  const seen = new Set<string>();
  const fields: Field[] = [header('title'), header('subTitle'), header('intro')];
  const blocks = Array.isArray(p['blocks']) ? (p['blocks'] as ArticleBlock[]) : [];
  for (const block of blocksInOrder(blocks) as unknown as Loose[]) {
    const id = block['id'];
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    if (block['type'] === 'text' || block['type'] === 'callout') {
      fields.push({ path: `blocks.${id}.htmlI18n`, blockId: id, suffix: 'htmlI18n', german: asText(block['html']), i18n: asI18n(block['htmlI18n']) });
    } else if (block['type'] === 'button') {
      const cta = asObject(block['cta']);
      fields.push({ path: `blocks.${id}.cta.labelI18n`, blockId: id, suffix: 'cta.labelI18n', german: asText(cta['label']), i18n: asI18n(cta['labelI18n']) });
    }
  }
  return fields;
}

const blockIdsOf = (section: ArticleSection): Set<string> => {
  const blocks = asObject(section.properties)['blocks'];
  return new Set((blocksInOrder(Array.isArray(blocks) ? (blocks as ArticleBlock[]) : []) as unknown as Loose[]).flatMap((b) => typeof b['id'] === 'string' ? [b['id']] : []));
};

/** Languages (not German) that have a translation. */
const translatedLanguages = (i18n: I18nString): string[] => Object.keys(i18n).filter((lang) => lang !== 'de' && i18n[lang].trim() !== '');

const metaOfSection = (section: ArticleSection): I18nMeta | undefined => {
  const meta = asObject(section.properties)['i18nMeta'];
  return isObject(meta) ? (meta as I18nMeta) : undefined;
};

/** The block of the opened article that `id` stands for: itself, or the block it was copied from, following copies of copies. */
function sourceBlockOf(id: string, openedIds: Set<string>, copiedFrom: Record<string, string>): string | undefined {
  const seen = new Set<string>();
  for (let current: string | undefined = id; current !== undefined && !seen.has(current); current = copiedFrom[current]) {
    if (openedIds.has(current)) return current;
    seen.add(current);
  }
  return undefined;
}

/**
 * The article for saving: `properties.i18nMeta` brought up to date (§10). `copiedFrom` maps the id of a block copied in the
 * editor to the id it was copied from (the inverse of the `copies` of `duplicateBlock`); copies of copies resolve. It may also hold
 * the upper text of a join that did not exist at opening and is no copy, mapped to the id of the joined lower text: the
 * upper then takes over the lower's meta and is marked against the lower's German.
 * A translation whose German changed since opening and that has no meta gets `{ manual, hash of the German as opened }`; existing
 * meta is never changed. A copy takes the meta of its source; meta of blocks that are gone is dropped.
 */
export async function prepareArticleForSave(
  opened: ArticleSection, current: ArticleSection, copiedFrom: Record<string, string>, now: string,
): Promise<ArticleSection> {
  const base = metaOfSection(current) ?? metaOfSection(opened);
  const openedFields = new Map(fieldsOf(opened).map((f) => [f.path, f]));
  const openedIds = blockIdsOf(opened);
  const currentIds = blockIdsOf(current);
  const sourceOf = (id: string): string | undefined => sourceBlockOf(id, openedIds, copiedFrom);

  const result: I18nMeta = {};
  // meta of blocks that still exist (and of everything that is no block path)
  for (const [path, byLang] of Object.entries(base ?? {})) {
    // only a known block of the opened article that is gone now loses its meta; what lies inside unknown blocks stays
    const gone = [...openedIds].some((id) => !currentIds.has(id) && path.startsWith(`blocks.${id}.`));
    if (!gone) result[path] = { ...byLang };
  }
  // a copy takes the meta of its source
  for (const id of currentIds) {
    const src = openedIds.has(id) ? undefined : sourceOf(id);
    if (src === undefined) continue;
    for (const [path, byLang] of Object.entries(base ?? {})) {
      if (!path.startsWith(`blocks.${src}.`)) continue;
      const copyPath = `blocks.${id}.${path.slice(`blocks.${src}.`.length)}`;
      result[copyPath] = { ...byLang, ...result[copyPath] };
    }
  }
  // translations whose German changed since opening
  for (const field of fieldsOf(current)) {
    const langs = translatedLanguages(field.i18n);
    if (langs.length === 0) continue;
    const src = field.blockId === undefined ? undefined : sourceOf(field.blockId);
    if (field.blockId !== undefined && src === undefined) continue;     // a new block that is no copy
    const sourcePath = field.blockId === undefined ? field.path : `blocks.${src}.${field.suffix}`;
    const before = openedFields.get(sourcePath);
    if (!before) continue;
    const [was, is] = await Promise.all([germanHash(before.german), germanHash(field.german)]);
    if (was === is) continue;
    for (const lang of langs) {
      if (result[field.path]?.[lang] ?? base?.[sourcePath]?.[lang]) continue;
      result[field.path] = { ...result[field.path], [lang]: { origin: 'manual', srcHash: was, at: now } };
    }
  }

  const { i18nMeta: _old, ...properties } = current.properties as ArticleConfig;
  return { ...current, properties: Object.keys(result).length > 0 ? { ...properties, i18nMeta: result } : properties } as ArticleSection;
}

/**
 * path → languages whose translation is outdated. With meta: its hash is not the one of the current German. Without: the German
 * changed since opening. Blocks that did not exist at opening have no meta here and are not reported.
 */
export async function outdatedPaths(opened: ArticleSection, current: ArticleSection): Promise<Record<string, string[]>> {
  const meta = metaOfSection(current);
  const openedFields = new Map(fieldsOf(opened).map((f) => [f.path, f]));
  const out: Record<string, string[]> = {};
  for (const field of fieldsOf(current)) {
    const langs = translatedLanguages(field.i18n);
    if (langs.length === 0) continue;
    const [now, was] = await Promise.all([germanHash(field.german), openedFields.has(field.path) ? germanHash(openedFields.get(field.path)?.german ?? '') : undefined]);
    const outdated = langs.filter((lang) => {
      const stored = meta?.[field.path]?.[lang];
      return stored ? stored.srcHash !== now : was !== undefined && was !== now;
    });
    if (outdated.length > 0) out[field.path] = outdated;
  }
  return out;
}
