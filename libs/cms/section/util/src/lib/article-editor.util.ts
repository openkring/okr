import {
  ARTICLE_BLOCK_TYPES, IMAGE_CONFIG_SHAPE, type ArticleBlock, type ArticleBlockType, type ArticleColumn, type ColumnsBlock, type I18nString, type TextBlock,
} from '@okr/shared-models';

import { COLUMN_BLOCK_TYPES, hasVisibleText, isObject } from './article-block.util';
import { ARTICLE_BLOCKS_MAX } from './article-blocks.validations';

/**
 * Operations on the block list of a free article (spec 1.175 §7.4, §7.5): the base of the canvas, the undo history and saving.
 * All functions are pure and never mutate. A block that does not change keeps its object, and an operation that is not
 * allowed returns its input array. Stored blocks may be malformed (unknown types, columns without inner arrays): nothing here throws.
 */

/** Where a block stands. Without `columnsId`: top level. `index` counts the list without the block being moved. */
export interface BlockPlace { columnsId?: string; column?: number; index: number }
export type NewId = () => string;

/** Column widths offered by the editor, each summing to 12. */
export const COLUMN_PRESETS: readonly number[][] = [[6, 6], [4, 8], [8, 4], [4, 4, 4], [3, 6, 3]];

const asBlocks = (value: unknown): ArticleBlock[] => (Array.isArray(value) ? value.filter(isObject) as unknown as ArticleBlock[] : []);
/** The columns of a columns block, as stored; entries that are no objects are left out. */
const columnsOf = (block: ArticleBlock): ArticleColumn[] =>
  block.type === 'columns' && Array.isArray(block.columns) ? (block.columns.filter(isObject) as unknown as ArticleColumn[]) : [];
const isKnownType = (type: unknown): type is ArticleBlockType => (ARTICLE_BLOCK_TYPES as readonly unknown[]).includes(type);
const fitsColumn = (block: ArticleBlock): boolean => COLUMN_BLOCK_TYPES.includes(block.type);
const sameList = (a: BlockPlace, b: BlockPlace): boolean => a.columnsId === b.columnsId && a.column === b.column;

/** The raw stored list at `place` (indexes of a place always refer to it), or undefined when it does not exist. */
function listAt(blocks: ArticleBlock[], place: Pick<BlockPlace, 'columnsId' | 'column'>): ArticleBlock[] | undefined {
  if (place.columnsId === undefined) return blocks;
  const host = blocks.find((b) => isObject(b) && b.id === place.columnsId && b.type === 'columns') as ColumnsBlock | undefined;
  const col = Array.isArray(host?.columns) ? host.columns[place.column ?? -1] : undefined;
  return isObject(col) && Array.isArray(col.blocks) ? col.blocks : undefined;
}

export function findBlock(blocks: ArticleBlock[], id: string): { block: ArticleBlock; place: BlockPlace } | undefined {
  // indexes are taken on the raw lists, so that entries that are no objects do not shift them
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!isObject(block)) continue;
    if (block.id === id) return { block, place: { index } };
    const cols = Array.isArray((block as ColumnsBlock).columns) ? (block as ColumnsBlock).columns : [];
    for (let column = 0; column < cols.length; column++) {
      const list = isObject(cols[column]) && Array.isArray(cols[column].blocks) ? cols[column].blocks : [];
      const i = list.findIndex((b) => isObject(b) && b.id === id);
      if (i >= 0) return { block: list[i], place: { columnsId: block.id, column, index: i } };
    }
  }
  return undefined;
}

/** Reading order: a columns block, then its inner blocks column by column. */
export function blocksInOrder(blocks: ArticleBlock[]): ArticleBlock[] {
  const out: ArticleBlock[] = [];
  for (const block of asBlocks(blocks)) {
    out.push(block);
    for (const col of columnsOf(block)) out.push(...asBlocks(col.blocks));
  }
  return out;
}

export function createBlock(type: ArticleBlockType, newId: NewId): ArticleBlock {
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
  }
}

export function allowedTypesAt(place: Pick<BlockPlace, 'columnsId'>): readonly ArticleBlockType[] {
  return place.columnsId === undefined ? ARTICLE_BLOCK_TYPES : (COLUMN_BLOCK_TYPES as readonly ArticleBlockType[]);
}

export function canAddBlock(blocks: ArticleBlock[]): boolean {
  return asBlocks(blocks).length < ARTICLE_BLOCKS_MAX;
}

/** Replaces the list at `place` by `change(list)`; the same array when the place does not exist or the list stays the same. */
function updateList(blocks: ArticleBlock[], place: Pick<BlockPlace, 'columnsId' | 'column'>, change: (list: ArticleBlock[]) => ArticleBlock[]): ArticleBlock[] {
  if (place.columnsId === undefined) return change(blocks);
  const at = blocks.findIndex((b) => b?.id === place.columnsId && b.type === 'columns');
  const column = place.column ?? -1;
  if (at < 0) return blocks;
  const host = blocks[at] as ColumnsBlock;
  const cols = Array.isArray(host.columns) ? host.columns : [];
  if (!isObject(cols[column])) return blocks;
  const old = cols[column].blocks;
  const next = change(Array.isArray(old) ? old : []);
  if (next === old) return blocks;
  const columns = cols.map((c, i) => (i === column ? { ...c, blocks: next } : c)) as ArticleColumn[];
  return blocks.map((b, i) => (i === at ? { ...host, columns } : b));
}

function insertInto(list: ArticleBlock[], block: ArticleBlock, index: number): ArticleBlock[] {
  const at = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), block, ...list.slice(at)];
}

export function insertBlock(blocks: ArticleBlock[], block: ArticleBlock, place: BlockPlace): ArticleBlock[] {
  if (place.columnsId === undefined ? !canAddBlock(blocks) : !fitsColumn(block)) return blocks;
  return updateList(blocks, place, (list) => insertInto(list, block, place.index));
}

export function removeBlock(blocks: ArticleBlock[], id: string): ArticleBlock[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  return updateList(blocks, found.place, (list) => list.filter((_, i) => i !== found.place.index));
}

export function replaceBlock(blocks: ArticleBlock[], block: ArticleBlock): ArticleBlock[] {
  const found = findBlock(blocks, block.id);
  if (!found || (found.place.columnsId !== undefined && !fitsColumn(block))) return blocks;
  return updateList(blocks, found.place, (list) => list.map((b, i) => (i === found.place.index ? block : b)));
}

export function moveBlock(blocks: ArticleBlock[], id: string, place: BlockPlace): ArticleBlock[] {
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

export function moveBlockBy(blocks: ArticleBlock[], id: string, delta: -1 | 1): ArticleBlock[] {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  const length = listAt(blocks, found.place)?.length ?? 0;
  const index = found.place.index + delta;
  if (index < 0 || index >= length) return blocks;
  return moveBlock(blocks, id, { ...found.place, index });
}

function copyWithNewIds(block: ArticleBlock, newId: NewId, copies: Record<string, string>): ArticleBlock {
  const id = newId();
  copies[block.id] = id;
  if (block.type !== 'columns') return { ...block, id } as ArticleBlock;
  const columns = columnsOf(block).map((c) => ({ ...c, blocks: asBlocks(c.blocks).map((b) => copyWithNewIds(b, newId, copies)) }));
  return { ...block, id, columns } as ArticleBlock;
}

export function duplicateBlock(blocks: ArticleBlock[], id: string, newId: NewId): { blocks: ArticleBlock[]; id: string; copies: Record<string, string> } | undefined {
  const found = findBlock(blocks, id);
  if (!found || !isKnownType(found.block.type)) return undefined;
  const copies: Record<string, string> = {};
  const copy = copyWithNewIds(found.block, newId, copies);
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
const isEmptyText = (block: ArticleBlock): boolean =>
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
export function joinWithAbove(blocks: ArticleBlock[], id: string): { blocks: ArticleBlock[]; id: string; upperHtml: string; joined: boolean } | undefined {
  const found = findBlock(blocks, id);
  if (!found || found.block.type !== 'text' || found.place.index === 0) return undefined;
  const lower = found.block;
  const list = listAt(blocks, found.place) ?? [];
  const above = list[found.place.index - 1];
  if (!isObject(above)) return undefined;
  if (above.type === 'text') {
    const upperHtml = typeof above.html === 'string' ? above.html : '';
    const html = upperHtml + (typeof lower.html === 'string' ? lower.html : '');
    const htmlI18n = joinI18n({ html: upperHtml, htmlI18n: above.htmlI18n }, { html: typeof lower.html === 'string' ? lower.html : '', htmlI18n: lower.htmlI18n });
    const { htmlI18n: _old, ...rest } = above;
    const joinedBlock = { ...rest, html, ...(htmlI18n ? { htmlI18n } : {}) };
    const next = removeBlock(replaceBlock(blocks, joinedBlock), id);
    return { blocks: next, id: above.id, upperHtml, joined: true };
  }
  if (!isEmptyText(lower)) return undefined;
  const target = list.slice(0, found.place.index).reverse().find((b): b is TextBlock => isObject(b) && b.type === 'text');
  if (!target) return undefined;
  return { blocks: removeBlock(blocks, id), id: target.id, upperHtml: typeof target.html === 'string' ? target.html : '', joined: false };
}
