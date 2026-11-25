import {
  EVENTS_CONFIG_SHAPE, IMAGE_CONFIG_SHAPE, type ArticleBlock, type ArticleBlockType, type ArticleColumn, type ColumnsBlock, type I18nString,
  type MailBlock, type MailBlockType, type TextBlock,
} from '@okr/shared-models';

import { COLUMN_BLOCK_TYPES, hasVisibleText, isObject } from './article-block.util';
import { ARTICLE_BLOCKS_MAX } from './article-blocks.validations';
import { ARTICLE_PROFILE, type EditorProfile } from './editor-profile';

/**
 * Operations on the block list of a free article (spec 1.175 §7.4, §7.5), or of a Versand mail (1.176): the base of the canvas, the undo
 * history and saving. A list keeps its type: `B` is `ArticleBlock` or `MailBlock`. All functions are pure and never mutate. A block that
 * does not change keeps its object, and an operation that is not allowed returns its input array. Stored blocks may be malformed (unknown
 * types, columns without inner arrays): nothing here throws.
 */

/** Where a block stands. Without `columnsId`: top level. `index` counts the list without the block being moved. */
export interface BlockPlace { columnsId?: string; column?: number; index: number }
export type NewId = () => string;

/** Column widths offered by the editor, each summing to 12. */
export const COLUMN_PRESETS: readonly number[][] = [[6, 6], [4, 8], [8, 4], [4, 4, 4], [3, 6, 3]];

const asBlocks = <B extends MailBlock = ArticleBlock>(value: unknown): B[] => (Array.isArray(value) ? value.filter(isObject) as unknown as B[] : []);
/** The columns of a columns block, as stored; entries that are no objects are left out. */
const columnsOf = (block: MailBlock): ArticleColumn[] =>
  block.type === 'columns' && Array.isArray(block.columns) ? (block.columns.filter(isObject) as unknown as ArticleColumn[]) : [];
const fitsColumn = (block: MailBlock): boolean => COLUMN_BLOCK_TYPES.includes(block.type);
const sameList = (a: BlockPlace, b: BlockPlace): boolean => a.columnsId === b.columnsId && a.column === b.column;

/** The raw stored list at `place` (indexes of a place always refer to it), or undefined when it does not exist. */
function listAt(blocks: MailBlock[], place: Pick<BlockPlace, 'columnsId' | 'column'>): MailBlock[] | undefined {
  if (place.columnsId === undefined) return blocks;
  const host = blocks.find((b) => isObject(b) && b.id === place.columnsId && b.type === 'columns') as ColumnsBlock | undefined;
  const col = Array.isArray(host?.columns) ? host.columns[place.column ?? -1] : undefined;
  return isObject(col) && Array.isArray(col.blocks) ? col.blocks : undefined;
}

export function findBlock<B extends MailBlock>(blocks: B[], id: string): { block: B; place: BlockPlace } | undefined {
  // indexes are taken on the raw lists, so that entries that are no objects do not shift them
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!isObject(block)) continue;
    if (block.id === id) return { block, place: { index } };
    const stored = (block as MailBlock as ColumnsBlock).columns;
    const cols = Array.isArray(stored) ? stored : [];
    for (let column = 0; column < cols.length; column++) {
      const list = isObject(cols[column]) && Array.isArray(cols[column].blocks) ? cols[column].blocks : [];
      const i = list.findIndex((b) => isObject(b) && b.id === id);
      if (i >= 0) return { block: list[i] as MailBlock as B, place: { columnsId: block.id, column, index: i } };
    }
  }
  return undefined;
}

/** Reading order: a columns block, then its inner blocks column by column. */
export function blocksInOrder<B extends MailBlock>(blocks: B[]): B[] {
  const out: B[] = [];
  for (const block of asBlocks<B>(blocks)) {
    out.push(block);
    for (const col of columnsOf(block)) out.push(...asBlocks<B>(col.blocks));
  }
  return out;
}

export function createBlock(type: ArticleBlockType, newId: NewId): ArticleBlock;
export function createBlock(type: MailBlockType, newId: NewId): MailBlock;
export function createBlock(type: MailBlockType, newId: NewId): MailBlock {
  const id = newId();
  switch (type) {
    case 'text': return { id, type, html: '' };
    case 'callout': return { id, type, html: '', tone: 'primary' };
    case 'image': return { id, type, image: { ...IMAGE_CONFIG_SHAPE, url: '' } };
    case 'gallery': return { id, type, images: [] };
    case 'button': return { id, type, cta: { label: '', url: '', style: 'primary' } };
    case 'columns': return { id, type, columns: [{ size: 6, blocks: [{ id: newId(), type: 'text', html: '' }] }, { size: 6, blocks: [{ id: newId(), type: 'text', html: '' }] }] };
    case 'divider': return { id, type };
    case 'space': return { id, type, size: 'medium' };
    case 'events': return { id, type, calendarKey: '', maxEvents: EVENTS_CONFIG_SHAPE.maxEvents };
  }
}

export function allowedTypesAt(place: Pick<BlockPlace, 'columnsId'>): readonly ArticleBlockType[];
export function allowedTypesAt(place: Pick<BlockPlace, 'columnsId'>, profile: EditorProfile): readonly MailBlockType[];
export function allowedTypesAt(place: Pick<BlockPlace, 'columnsId'>, profile: EditorProfile = ARTICLE_PROFILE): readonly MailBlockType[] {
  return place.columnsId === undefined ? profile.types : profile.columnTypes;
}

export function canAddBlock(blocks: MailBlock[]): boolean {
  return asBlocks(blocks).length < ARTICLE_BLOCKS_MAX;
}

/** Replaces the list at `place` by `change(list)`; the same array when the place does not exist or the list stays the same. */
function updateList<B extends MailBlock>(blocks: B[], place: Pick<BlockPlace, 'columnsId' | 'column'>, change: (list: B[]) => B[]): B[] {
  if (place.columnsId === undefined) return change(blocks);
  const at = blocks.findIndex((b) => b?.id === place.columnsId && b.type === 'columns');
  const column = place.column ?? -1;
  if (at < 0) return blocks;
  const host = blocks[at] as MailBlock as ColumnsBlock;
  const cols = Array.isArray(host.columns) ? host.columns : [];
  if (!isObject(cols[column])) return blocks;
  const old = cols[column].blocks as MailBlock[] as B[];
  const next = change(Array.isArray(old) ? old : []);
  if (next === old) return blocks;
  const columns = cols.map((c, i) => (i === column ? { ...c, blocks: next } : c)) as ArticleColumn[];
  return blocks.map((b, i) => (i === at ? { ...host, columns } as MailBlock as B : b));
}

function insertInto<B extends MailBlock>(list: B[], block: B, index: number): B[] {
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), block, ...list.slice(at)];
}

export function insertBlock<B extends MailBlock>(blocks: B[], block: NoInfer<B>, place: BlockPlace): B[] {
  if (place.columnsId === undefined ? !canAddBlock(blocks) : !fitsColumn(block)) return blocks;
  return updateList(blocks, place, (list) => insertInto(list, block, place.index));
}

export function removeBlock<B extends MailBlock>(blocks: B[], id: string): B[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  return updateList(blocks, found.place, (list) => list.filter((_, i) => i !== found.place.index));
}

export function replaceBlock<B extends MailBlock>(blocks: B[], block: NoInfer<B>): B[] {
  const found = findBlock(blocks, block.id);
  if (!found || (found.place.columnsId !== undefined && !fitsColumn(block))) return blocks;
  return updateList(blocks, found.place, (list) => list.map((b, i) => (i === found.place.index ? block : b)));
}

export function moveBlock<B extends MailBlock>(blocks: B[], id: string, place: BlockPlace): B[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  const { block } = found;
  if (place.columnsId !== undefined && (!fitsColumn(block) || place.columnsId === id)) return blocks;
  if (sameList(found.place, place) && found.place.index === place.index) return blocks;
  // a block that leaves a column for the top level adds to the top-level count
  if (place.columnsId === undefined && found.place.columnsId !== undefined && !canAddBlock(blocks)) return blocks;
  const without = removeBlock(blocks, id);
  const moved = updateList(without, place, (list) => insertInto(list, block, place.index));
  return moved === without ? blocks : moved;
}

export function moveBlockBy<B extends MailBlock>(blocks: B[], id: string, delta: -1 | 1): B[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  const length = listAt(blocks, found.place)?.length ?? 0;
  const index = found.place.index + delta;
  if (index < 0 || index >= length) return blocks;
  return moveBlock(blocks, id, { ...found.place, index });
}

function copyWithNewIds<B extends MailBlock>(block: B, newId: NewId, copies: Record<string, string>): B {
  const id = newId();
  copies[block.id] = id;
  if (block.type !== 'columns') return { ...block, id };
  const columns = columnsOf(block).map((c) => ({ ...c, blocks: asBlocks(c.blocks).map((b) => copyWithNewIds(b, newId, copies)) }));
  return { ...block, id, columns };
}

export function duplicateBlock<B extends MailBlock>(
  blocks: B[], id: string, newId: NewId, profile: EditorProfile = ARTICLE_PROFILE,
): { blocks: B[]; id: string; copies: Record<string, string> } | undefined {
  const found = findBlock(blocks, id);
  if (!found || !profile.types.includes(found.block.type)) return undefined;
  const copies: Record<string, string> = {};
  const copy = copyWithNewIds<B>(found.block, newId, copies);
  const out = insertBlock(blocks, copy, { ...found.place, index: found.place.index + 1 });
  return out === blocks ? undefined : { blocks: out, id: copy.id, copies };
}

export function setColumnCount(block: ColumnsBlock, count: 2 | 3): ColumnsBlock {
  const cols = columnsOf(block);
  if (cols.length === count) return block;
  const sizes = COLUMN_PRESETS.find((p) => p.length === count) as number[];
  const lists = cols.map((c) => (Array.isArray(c.blocks) ? c.blocks : []));
  const kept = lists.slice(0, count);
  while (kept.length < count) kept.push([]);
  // columns beyond the new count move to the end of the last remaining one
  const extra = lists.slice(count).flat();
  if (extra.length > 0) kept[count - 1] = [...kept[count - 1], ...extra];
  return { ...block, columns: kept.map((blocks, i) => ({ size: sizes[i], blocks })) as ArticleColumn[] };
}

export function setColumnSizes(block: ColumnsBlock, sizes: number[]): ColumnsBlock {
  const cols = columnsOf(block);
  const valid = Array.isArray(sizes) && sizes.length === cols.length && sizes.every((s) => Number.isInteger(s) && s >= 1 && s <= 11)
    && sizes.reduce((sum, s) => sum + s, 0) === 12;
  if (!valid || cols.every((c, i) => c.size === sizes[i])) return block;
  return { ...block, columns: cols.map((c, i) => ({ ...c, size: sizes[i] })) as ArticleColumn[] };
}

const filled = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isEmptyText = (block: MailBlock): boolean =>
  block.type === 'text' && !hasVisibleText(block.html)
  && Object.values(isObject(block.htmlI18n) ? block.htmlI18n : {}).every((v) => !hasVisibleText(v));

/** The languages of two texts joined; a language one side lacks is filled with that side's German. */
function joinI18n(upper: { html: string; htmlI18n?: I18nString }, lower: { html: string; htmlI18n?: I18nString }): I18nString | undefined {
  const u = isObject(upper.htmlI18n) ? upper.htmlI18n : {};
  const l = isObject(lower.htmlI18n) ? lower.htmlI18n : {};
  const langs = [...new Set([...Object.keys(u), ...Object.keys(l)])].filter((k) => filled(u[k]) || filled(l[k]));
  if (langs.length === 0) return undefined;
  const out: I18nString = {};
  for (const lang of langs) out[lang] = (filled(u[lang]) ? u[lang] : upper.html) + (filled(l[lang]) ? l[lang] : lower.html);
  return out;
}

/**
 * Backspace at the start of a text (spec 1.175 §7.5): joins it with the text right above in the same list. An empty text
 * under a non-text is removed instead (`joined: false`) and `id` is the nearest text above, or the result is `undefined`.
 */
export function joinWithAbove<B extends MailBlock>(blocks: B[], id: string): { blocks: B[]; id: string; upperHtml: string; joined: boolean } | undefined {
  const found = findBlock(blocks, id);
  if (!found || found.block.type !== 'text' || found.place.index === 0) return undefined;
  const lower: TextBlock = found.block;
  const list = listAt(blocks, found.place) ?? [];
  const above = list[found.place.index - 1];
  if (!isObject(above)) return undefined;
  if (above.type === 'text') {
    const upperHtml = typeof above.html === 'string' ? above.html : '';
    const html = upperHtml + (typeof lower.html === 'string' ? lower.html : '');
    const htmlI18n = joinI18n({ html: upperHtml, htmlI18n: above.htmlI18n }, { html: typeof lower.html === 'string' ? lower.html : '', htmlI18n: lower.htmlI18n });
    const { htmlI18n: _old, ...rest } = above;
    const joinedBlock = { ...rest, html, ...(htmlI18n ? { htmlI18n } : {}) };
    const next = removeBlock(replaceBlock(blocks, joinedBlock as MailBlock as B), id);
    return { blocks: next, id: above.id, upperHtml, joined: true };
  }
  if (!isEmptyText(lower)) return undefined;
  const target = list.slice(0, found.place.index).reverse().find((b): b is TextBlock => isObject(b) && b.type === 'text');
  if (!target) return undefined;
  return { blocks: removeBlock(blocks, id), id: target.id, upperHtml: typeof target.html === 'string' ? target.html : '', joined: false };
}
