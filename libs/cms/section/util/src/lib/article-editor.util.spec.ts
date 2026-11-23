import { describe, expect, it } from 'vitest';

import { ARTICLE_BLOCK_TYPES, ArticleBlock, IMAGE_CONFIG_SHAPE } from '@okr/shared-models';

import { ARTICLE_BLOCKS_MAX } from './article-blocks.validations';
import {
  COLUMN_PRESETS, allowedTypesAt, blocksInOrder, canAddBlock, createBlock, duplicateBlock, findBlock, insertBlock, joinWithAbove,
  moveBlock, moveBlockBy, removeBlock, replaceBlock, setColumnCount, setColumnSizes,
} from './article-editor.util';

const text = (id: string, html = '<p>x</p>', o: object = {}) => ({ id, type: 'text', html, ...o }) as ArticleBlock;
const image = (id: string) => ({ id, type: 'image', image: { ...IMAGE_CONFIG_SHAPE, url: id } }) as ArticleBlock;
const gallery = (id: string) => ({ id, type: 'gallery', images: [] }) as ArticleBlock;
const callout = (id: string, html = '<p>c</p>') => ({ id, type: 'callout', html, tone: 'primary' }) as ArticleBlock;
const columns = (id: string, cols: ArticleBlock[][], sizes?: number[]) =>
  ({ id, type: 'columns', columns: cols.map((blocks, i) => ({ size: sizes?.[i] ?? 12 / cols.length, blocks })) }) as unknown as ArticleBlock;
const ids = (blocks: ArticleBlock[]) => blocks.map((b) => b.id);
const inner = (b: ArticleBlock | undefined, col: number) => ((b as unknown as { columns: { blocks: ArticleBlock[] }[] }).columns[col].blocks);
const counter = () => { let n = 0; return () => `n${++n}`; };

describe('findBlock / blocksInOrder', () => {
  const cols = columns('c', [[text('a')], [image('b'), text('d')]]);
  const all = [text('t'), cols, text('z')];

  it('finds top-level and inner blocks with their place', () => {
    expect(findBlock(all, 'z')?.place).toEqual({ index: 2 });
    expect(findBlock(all, 'd')?.place).toEqual({ columnsId: 'c', column: 1, index: 1 });
    expect(findBlock(all, 'c')?.block).toBe(cols);
    expect(findBlock(all, 'nope')).toBeUndefined();
  });
  it('lists blocks in reading order, inner blocks after their columns block', () => {
    expect(ids(blocksInOrder(all))).toEqual(['t', 'c', 'a', 'b', 'd', 'z']);
  });
  it('does not throw on malformed data', () => {
    const bad = [{ id: 'u', type: 'weird' }, { id: 'c', type: 'columns' }, { id: 'c2', type: 'columns', columns: [null, { size: 6 }] }, null] as unknown as ArticleBlock[];
    expect(ids(blocksInOrder(bad))).toEqual(['u', 'c', 'c2']);
    expect(findBlock(bad, 'x')).toBeUndefined();
    expect(removeBlock(bad, 'x')).toBe(bad);
  });
});

describe('createBlock', () => {
  it('creates each type with its defaults', () => {
    const n = counter();
    expect(createBlock('text', n)).toEqual({ id: 'n1', type: 'text', html: '' });
    expect(createBlock('callout', n)).toEqual({ id: 'n2', type: 'callout', html: '', tone: 'primary' });
    expect(createBlock('image', n)).toEqual({ id: 'n3', type: 'image', image: { ...IMAGE_CONFIG_SHAPE, url: '' } });
    expect(createBlock('gallery', n)).toEqual({ id: 'n4', type: 'gallery', images: [] });
    const button = createBlock('button', n);
    expect(button).toEqual({ id: 'n5', type: 'button', cta: { label: '', url: '', style: 'primary' } });
    expect('align' in button).toBe(false);
    expect(createBlock('divider', n)).toEqual({ id: 'n6', type: 'divider' });
    expect(createBlock('space', n)).toEqual({ id: 'n7', type: 'space', size: 'medium' });
  });
  it('creates columns: two columns of 6, each with one empty text with its own id', () => {
    const c = createBlock('columns', counter());
    expect(c.id).toBe('n1');
    const cols = (c as unknown as { columns: { size: number; blocks: ArticleBlock[] }[] }).columns;
    expect(cols.map((x) => x.size)).toEqual([6, 6]);
    expect(cols.map((x) => x.blocks)).toEqual([[{ id: 'n2', type: 'text', html: '' }], [{ id: 'n3', type: 'text', html: '' }]]);
  });
});

describe('allowedTypesAt / canAddBlock', () => {
  it('offers every type at top level and text, image, button in a column', () => {
    expect(allowedTypesAt({})).toEqual(ARTICLE_BLOCK_TYPES);
    expect(allowedTypesAt({ columnsId: 'c' })).toEqual(['text', 'image', 'button']);
  });
  it('allows adding below the maximum only', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => text(`t${i}`));
    expect(canAddBlock(make(ARTICLE_BLOCKS_MAX - 1))).toBe(true);
    expect(canAddBlock(make(ARTICLE_BLOCKS_MAX))).toBe(false);
  });
});

describe('insertBlock', () => {
  const a = text('a'), b = text('b');
  it('inserts at the start and at the end', () => {
    expect(ids(insertBlock([a, b], text('n'), { index: 0 }))).toEqual(['n', 'a', 'b']);
    expect(ids(insertBlock([a, b], text('n'), { index: 2 }))).toEqual(['a', 'b', 'n']);
    expect(ids(insertBlock([a, b], text('n'), { index: 99 }))).toEqual(['a', 'b', 'n']);
  });
  it('inserts into a column and keeps untouched blocks', () => {
    const c = columns('c', [[text('p')], []]);
    const out = insertBlock([a, c], image('n'), { columnsId: 'c', column: 1, index: 0 });
    expect(out[0]).toBe(a);
    expect(ids(inner(out[1], 1))).toEqual(['n']);
    expect(inner(out[1], 0)).toBe(inner(c, 0));
  });
  it('refuses a gallery in a column, and the 51st block', () => {
    const c = columns('c', [[], []]);
    const list = [c];
    expect(insertBlock(list, gallery('g'), { columnsId: 'c', column: 0, index: 0 })).toBe(list);
    const full = Array.from({ length: ARTICLE_BLOCKS_MAX }, (_, i) => text(`t${i}`));
    expect(insertBlock(full, text('x'), { index: 0 })).toBe(full);
  });
  it('refuses a place that does not exist', () => {
    const list = [a];
    expect(insertBlock(list, text('n'), { columnsId: 'zz', column: 0, index: 0 })).toBe(list);
  });
});

describe('moveBlock', () => {
  it('moves down and up in the same list by the index rule', () => {
    const l = [text('a'), text('b'), text('c')];
    expect(ids(moveBlock(l, 'a', { index: 1 }))).toEqual(['b', 'a', 'c']);
    expect(ids(moveBlock(l, 'a', { index: 2 }))).toEqual(['b', 'c', 'a']);
    expect(ids(moveBlock(l, 'c', { index: 0 }))).toEqual(['c', 'a', 'b']);
  });
  it('returns the same array when the block stays where it is', () => {
    const l = [text('a'), text('b')];
    expect(moveBlock(l, 'a', { index: 0 })).toBe(l);
  });
  it('moves from top level into a column and back out', () => {
    const t = text('t');
    const c = columns('c', [[text('p')], []]);
    const into = moveBlock([t, c], 't', { columnsId: 'c', column: 1, index: 0 });
    expect(ids(into)).toEqual(['c']);
    expect(ids(inner(into[0], 1))).toEqual(['t']);
    expect(inner(into[0], 0)).toBe(inner(c, 0));
    const out = moveBlock(into, 't', { index: 0 });
    expect(ids(out)).toEqual(['t', 'c']);
    expect(inner(out[1], 1)).toEqual([]);
  });
  it('moves between columns', () => {
    const l = [columns('c', [[text('a'), text('b')], [text('d')]])];
    const out = moveBlock(l, 'a', { columnsId: 'c', column: 1, index: 1 });
    expect(ids(inner(out[0], 0))).toEqual(['b']);
    expect(ids(inner(out[0], 1))).toEqual(['d', 'a']);
  });
  it('keeps the identity of untouched blocks', () => {
    const a = text('a'), b = text('b'), z = text('z'), c = columns('c', [[], []]);
    const out = moveBlock([a, b, c, z], 'a', { index: 3 });
    expect(out).toEqual([b, c, z, a]);
    expect(out[0]).toBe(b);
    expect(out[1]).toBe(c);
    expect(out[3]).toBe(a);
  });
  it('refuses columns into itself, columns into a column and a gallery into a column', () => {
    const c = columns('c', [[text('a')], []]);
    const g = gallery('g');
    const c2 = columns('c2', [[], []]);
    const l = [c, g, c2];
    expect(moveBlock(l, 'c', { columnsId: 'c', column: 0, index: 0 })).toBe(l);
    expect(moveBlock(l, 'c2', { columnsId: 'c', column: 0, index: 0 })).toBe(l);
    expect(moveBlock(l, 'g', { columnsId: 'c', column: 0, index: 0 })).toBe(l);
  });
  it('returns the same array for an unknown id', () => {
    const l = [text('a')];
    expect(moveBlock(l, 'zz', { index: 0 })).toBe(l);
  });
  it('moves an unknown type at top level but not into a column', () => {
    const u = { id: 'u', type: 'weird' } as unknown as ArticleBlock;
    const c = columns('c', [[], []]);
    expect(ids(moveBlock([u, text('a')], 'u', { index: 1 }))).toEqual(['a', 'u']);
    const l = [u, c];
    expect(moveBlock(l, 'u', { columnsId: 'c', column: 0, index: 0 })).toBe(l);
  });
});

describe('moveBlock cap and malformed lists', () => {
  const full = (extra: ArticleBlock) => [extra, ...Array.from({ length: ARTICLE_BLOCKS_MAX - 1 }, (_, i) => text(`t${i}`))];
  it('refuses a move from a column to a full top level, but allows a move inside the top level', () => {
    const l = full(columns('c', [[text('p')], []]));
    expect(l).toHaveLength(ARTICLE_BLOCKS_MAX);
    expect(moveBlock(l, 'p', { index: 0 })).toBe(l);
    expect(moveBlock(l, 't0', { index: 0 })).not.toBe(l);
    expect(moveBlock(l, 'p', { columnsId: 'c', column: 1, index: 0 })).not.toBe(l);
  });
  it('is not shifted by a null entry before the block', () => {
    const l = [null, text('a'), text('b')] as unknown as ArticleBlock[];
    expect(moveBlock(l, 'a', { index: 2 })).toEqual([null, text('b'), text('a')]);
    expect(removeBlock(l, 'b')).toEqual([null, text('a')]);
    const c = [columns('c', [[null as unknown as ArticleBlock, text('p'), text('q')], []])];
    expect(inner(removeBlock(c, 'q')[0], 0)).toEqual([null, text('p')]);
    expect(moveBlockBy(l, 'a', 1).map((b) => b?.id)).toEqual([undefined, 'b', 'a']);
  });
});

describe('moveBlockBy', () => {
  it('moves one step within its list', () => {
    const l = [text('a'), text('b'), text('c')];
    expect(ids(moveBlockBy(l, 'b', 1))).toEqual(['a', 'c', 'b']);
    expect(ids(moveBlockBy(l, 'b', -1))).toEqual(['b', 'a', 'c']);
    const c = [columns('c', [[text('p'), text('q')], []])];
    expect(ids(inner(moveBlockBy(c, 'p', 1)[0], 0))).toEqual(['q', 'p']);
  });
  it('returns the same array at either end', () => {
    const l = [text('a'), text('b')];
    expect(moveBlockBy(l, 'a', -1)).toBe(l);
    expect(moveBlockBy(l, 'b', 1)).toBe(l);
    expect(moveBlockBy(l, 'zz', 1)).toBe(l);
  });
});

describe('duplicateBlock', () => {
  it('copies a block right below it with a new id', () => {
    const a = text('a'), b = text('b');
    const r = duplicateBlock([a, b], 'a', counter());
    expect(r?.id).toBe('n1');
    expect(ids(r?.blocks ?? [])).toEqual(['a', 'n1', 'b']);
    expect(r?.copies).toEqual({ a: 'n1' });
    expect(r?.blocks[0]).toBe(a);
  });
  it('gives columns new ids for all inner blocks', () => {
    const c = columns('c', [[text('a'), image('b')], [text('d')]]);
    const r = duplicateBlock([c, text('z')], 'c', counter());
    expect(ids(r?.blocks ?? [])).toEqual(['c', r?.id, 'z']);
    expect(r?.copies).toEqual({ c: 'n1', a: 'n2', b: 'n3', d: 'n4' });
    const copy = r?.blocks[1];
    expect(ids(inner(copy, 0))).toEqual(['n2', 'n3']);
    expect(ids(inner(copy, 1))).toEqual(['n4']);
    expect(ids(inner(c, 0))).toEqual(['a', 'b']);
  });
  it('duplicates inside a column', () => {
    const c = columns('c', [[text('a')], []]);
    const r = duplicateBlock([c], 'a', counter());
    expect(ids(inner(r?.blocks[0], 0))).toEqual(['a', 'n1']);
  });
  it('returns undefined for unknown types, unknown ids and a full article', () => {
    const u = { id: 'u', type: 'weird' } as unknown as ArticleBlock;
    expect(duplicateBlock([u], 'u', counter())).toBeUndefined();
    expect(duplicateBlock([text('a')], 'zz', counter())).toBeUndefined();
    const full = Array.from({ length: ARTICLE_BLOCKS_MAX }, (_, i) => text(`t${i}`));
    expect(duplicateBlock(full, 't0', counter())).toBeUndefined();
  });
});

describe('removeBlock / replaceBlock', () => {
  it('removes a block and keeps the others', () => {
    const a = text('a'), b = text('b');
    const out = removeBlock([a, b], 'a');
    expect(out).toEqual([b]);
    expect(out[0]).toBe(b);
  });
  it('leaves an empty column when its last block is removed', () => {
    const out = removeBlock([columns('c', [[text('a')], [text('b')]])], 'a');
    expect(inner(out[0], 0)).toEqual([]);
    expect(ids(inner(out[0], 1))).toEqual(['b']);
  });
  it('gives [] when the last block goes', () => {
    expect(removeBlock([text('a')], 'a')).toEqual([]);
  });
  it('returns the same array for an unknown id', () => {
    const l = [text('a')];
    expect(removeBlock(l, 'zz')).toBe(l);
  });
  it('removes an unknown type', () => {
    expect(removeBlock([{ id: 'u', type: 'weird' } as unknown as ArticleBlock], 'u')).toEqual([]);
  });
  it('replaces by id at top level and in a column', () => {
    const a = text('a'), b = text('b');
    const n = text('a', '<p>new</p>');
    const out = replaceBlock([a, b], n);
    expect(out[0]).toBe(n);
    expect(out[1]).toBe(b);
    const c = columns('c', [[text('p')], []]);
    expect(inner(replaceBlock([c], text('p', '<p>q</p>'))[0], 0)[0]).toMatchObject({ html: '<p>q</p>' });
  });
  it('returns the same array when the id is unknown or the type does not fit a column', () => {
    const c = columns('c', [[text('p')], []]);
    const l = [c];
    expect(replaceBlock(l, text('zz'))).toBe(l);
    expect(replaceBlock(l, gallery('p'))).toBe(l);
  });
});

describe('setColumnCount', () => {
  it('goes from 2 to 3 columns with sizes 4/4/4 and an empty third', () => {
    const c = columns('c', [[text('a')], [text('b')]]) as never;
    const out = setColumnCount(c, 3);
    expect(out.columns.map((x) => x.size)).toEqual([4, 4, 4]);
    expect(out.columns[2].blocks).toEqual([]);
    expect(out.columns[0].blocks).toBe((c as typeof out).columns[0].blocks);
  });
  it('goes from 3 to 2 columns and appends the third column to the second', () => {
    const c = columns('c', [[text('a')], [text('b')], [text('d'), text('e')]]) as never;
    const out = setColumnCount(c, 2);
    expect(out.columns.map((x) => x.size)).toEqual([6, 6]);
    expect(ids(out.columns[1].blocks)).toEqual(['b', 'd', 'e']);
  });
  it('returns the same block when the count does not change', () => {
    const c = columns('c', [[], []]) as never;
    expect(setColumnCount(c, 2)).toBe(c);
  });
  it('does not throw on columns without inner arrays', () => {
    const c = { id: 'c', type: 'columns', columns: [{ size: 6 }, null] } as never;
    expect(setColumnCount(c, 3).columns.map((x) => x.blocks)).toEqual([[], [], []]);
  });
});

describe('setColumnSizes', () => {
  const c = columns('c', [[], []]) as never;
  it('sets valid sizes', () => {
    expect(setColumnSizes(c, [4, 8]).columns.map((x) => x.size)).toEqual([4, 8]);
  });
  it('returns the same block for a wrong sum, count or size', () => {
    expect(setColumnSizes(c, [4, 7])).toBe(c);
    expect(setColumnSizes(c, [4, 4, 4])).toBe(c);
    expect(setColumnSizes(c, [0, 12])).toBe(c);
    expect(setColumnSizes(c, [6.5, 5.5])).toBe(c);
  });
  it('offers presets that all sum to 12', () => {
    expect(COLUMN_PRESETS).toEqual([[6, 6], [4, 8], [8, 4], [4, 4, 4], [3, 6, 3]]);
    for (const p of COLUMN_PRESETS) expect(p.reduce((s, x) => s + x, 0)).toBe(12);
  });
});

describe('joinWithAbove', () => {
  it('joins two texts; the upper id stays', () => {
    const r = joinWithAbove([text('u', '<p>a</p>'), text('l', '<p>b</p>')], 'l');
    expect(r).toMatchObject({ id: 'u', upperHtml: '<p>a</p>', joined: true });
    expect(r?.blocks).toEqual([{ id: 'u', type: 'text', html: '<p>a</p><p>b</p>' }]);
  });
  it('fills a language only one side has with the other side German', () => {
    const r = joinWithAbove([text('u', '<p>a</p>', { htmlI18n: { en: 'A' } }), text('l', '<p>b</p>')], 'l');
    expect(r?.blocks[0]).toMatchObject({ html: '<p>a</p><p>b</p>', htmlI18n: { en: 'A<p>b</p>' } });
    const r2 = joinWithAbove([text('u', '<p>a</p>'), text('l', '<p>b</p>', { htmlI18n: { fr: 'B' } })], 'l');
    expect(r2?.blocks[0]).toMatchObject({ htmlI18n: { fr: '<p>a</p>B' } });
  });
  it('writes no htmlI18n when no language has text, and counts an empty string as missing', () => {
    const r = joinWithAbove([text('u', '<p>a</p>', { htmlI18n: { en: '' } }), text('l', '<p>b</p>', { htmlI18n: {} })], 'l');
    expect('htmlI18n' in (r?.blocks[0] as object)).toBe(false);
    const r2 = joinWithAbove([text('u', '<p>a</p>', { htmlI18n: { en: 'A' } }), text('l', '<p>b</p>', { htmlI18n: { en: '' } })], 'l');
    expect(r2?.blocks[0]).toMatchObject({ htmlI18n: { en: 'A<p>b</p>' } });
  });
  it('keeps the identity of untouched blocks and does not mutate', () => {
    const u = text('u', '<p>a</p>'), l = text('l', '<p>b</p>'), z = text('z');
    const r = joinWithAbove([z, u, l], 'l');
    expect(r?.blocks[0]).toBe(z);
    expect(u.type === 'text' && u.html).toBe('<p>a</p>');
    expect(ids(r?.blocks ?? [])).toEqual(['z', 'u']);
  });
  it('does nothing when an image stands above a text with content', () => {
    expect(joinWithAbove([image('i'), text('l')], 'l')).toBeUndefined();
  });
  it('removes an empty text below an image and points at the nearest text above', () => {
    const r = joinWithAbove([text('t'), image('i'), text('l', '<p></p>')], 'l');
    expect(r).toMatchObject({ id: 't', joined: false });
    expect(ids(r?.blocks ?? [])).toEqual(['t', 'i']);
  });
  it('gives undefined when an empty text has no text above', () => {
    expect(joinWithAbove([image('i'), text('l', '')], 'l')).toBeUndefined();
  });
  it('does nothing for the first block of a list, also in a column', () => {
    expect(joinWithAbove([text('a'), text('b')], 'a')).toBeUndefined();
    expect(joinWithAbove([columns('c', [[text('a')], [text('b')]])], 'b')).toBeUndefined();
  });
  it('joins inside a column', () => {
    const r = joinWithAbove([columns('c', [[text('a', '<p>1</p>'), text('b', '<p>2</p>')], []])], 'b');
    expect(r?.id).toBe('a');
    expect(inner(r?.blocks[0], 0)).toEqual([{ id: 'a', type: 'text', html: '<p>1</p><p>2</p>' }]);
  });
  it('does nothing when a callout stands above, or the block is not a text', () => {
    expect(joinWithAbove([callout('k'), text('l')], 'l')).toBeUndefined();
    expect(joinWithAbove([text('a'), callout('k')], 'k')).toBeUndefined();
    expect(joinWithAbove([text('a'), text('b')], 'zz')).toBeUndefined();
  });
});
