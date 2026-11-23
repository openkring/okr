import { describe, expect, it } from 'vitest';

import type { ArticleBlock, ArticleBlockType } from '@okr/shared-models';

import { canDropAt, dropChange, parentId } from './article-canvas.util';

const text = (id: string, html = `<p>${id}</p>`): ArticleBlock => ({ id, type: 'text', html });
const gallery = (id: string): ArticleBlock => ({ id, type: 'gallery', images: [] });
const columns = (id: string, ...lists: ArticleBlock[][]): ArticleBlock =>
  ({ id, type: 'columns', columns: lists.map((blocks) => ({ size: 12 / lists.length, blocks })) }) as ArticleBlock;
const unknown = (id: string): ArticleBlock => ({ id, type: 'video' }) as unknown as ArticleBlock;
const ids = (blocks: ArticleBlock[] | undefined): string[] => (blocks ?? []).map((b) => b.id);
const innerIds = (block: ArticleBlock | undefined): string[][] => (block?.type === 'columns' ? block.columns.map((c) => ids(c.blocks)) : []);
const counter = (): (() => string) => {
  let n = 0;
  return () => `new${++n}`;
};
const blocks = (): ArticleBlock[] => [text('a'), columns('c', [text('x'), text('y')], [text('z')]), gallery('g'), text('b')];

describe('dropChange', () => {
  it('puts a new block at the index and selects it', () => {
    const change = dropChange(blocks(), { newType: 'divider' }, { index: 1 }, counter());
    expect(ids(change?.blocks)).toEqual(['a', 'new1', 'c', 'g', 'b']);
    expect(change?.selectedId).toBe('new1');
    expect(change?.copies).toBeUndefined();
    expect(change?.tag).toBeUndefined();
  });
  it('puts a new block into a column', () => {
    const change = dropChange(blocks(), { newType: 'button' }, { columnsId: 'c', column: 1, index: 0 }, counter());
    expect(innerIds(change?.blocks[1])).toEqual([['x', 'y'], ['new1', 'z']]);
    expect(change?.selectedId).toBe('new1');
  });
  it('selects the columns, not one of the texts in them', () => {
    const change = dropChange([], { newType: 'columns' }, { index: 0 }, counter());
    expect(change?.selectedId).toBe(change?.blocks[0].id);
  });
  it('moves a block within its list; the index counts the list without it', () => {
    const change = dropChange(blocks(), { id: 'a' }, { index: 2 }, counter());
    expect(ids(change?.blocks)).toEqual(['c', 'g', 'a', 'b']);
    expect(change?.selectedId).toBe('a');
  });
  it('moves a block into a column, between columns and out of it', () => {
    expect(innerIds(dropChange(blocks(), { id: 'b' }, { columnsId: 'c', column: 0, index: 1 }, counter())?.blocks[1])).toEqual([['x', 'b', 'y'], ['z']]);
    expect(innerIds(dropChange(blocks(), { id: 'x' }, { columnsId: 'c', column: 1, index: 1 }, counter())?.blocks[1])).toEqual([['y'], ['z', 'x']]);
    const out = dropChange(blocks(), { id: 'z' }, { index: 0 }, counter());
    expect(ids(out?.blocks)).toEqual(['z', 'a', 'c', 'g', 'b']);
    expect(innerIds(out?.blocks[2])).toEqual([['x', 'y'], []]);
  });
  it('is undefined for a gallery into a column, new or moved', () => {
    expect(dropChange(blocks(), { newType: 'gallery' }, { columnsId: 'c', column: 0, index: 0 }, counter())).toBeUndefined();
    expect(dropChange(blocks(), { id: 'g' }, { columnsId: 'c', column: 0, index: 0 }, counter())).toBeUndefined();
  });
  it('is undefined at its own place', () => {
    expect(dropChange(blocks(), { id: 'a' }, { index: 0 }, counter())).toBeUndefined();
    expect(dropChange(blocks(), { id: 'y' }, { columnsId: 'c', column: 0, index: 1 }, counter())).toBeUndefined();
  });
  it('is undefined for a new block, or one out of a column, in a full article', () => {
    const full = [...Array.from({ length: 49 }, (_, i) => text(`t${i}`)), columns('c', [text('x')], [])];
    expect(dropChange(full, { newType: 'text' }, { index: 3 }, counter())).toBeUndefined();
    expect(dropChange(full, { id: 'x' }, { index: 3 }, counter())).toBeUndefined();
    expect(dropChange(full, { id: 't1' }, { index: 3 }, counter())?.selectedId).toBe('t1');
    expect(dropChange(full, { newType: 'text' }, { columnsId: 'c', column: 1, index: 0 }, counter())?.selectedId).toBe('new1');
  });
  it('is undefined for data it does not know, a block or a place that is gone', () => {
    expect(dropChange(blocks(), {}, { index: 0 }, counter())).toBeUndefined();
    expect(dropChange(blocks(), { newType: 'video' as ArticleBlockType }, { index: 0 }, counter())).toBeUndefined();
    expect(dropChange(blocks(), { id: 'gone' }, { index: 0 }, counter())).toBeUndefined();
    expect(dropChange(blocks(), { id: 'a' }, { columnsId: 'gone', column: 0, index: 0 }, counter())).toBeUndefined();
  });
  it('moves an unknown block without changing it', () => {
    const video = unknown('v');
    const change = dropChange([text('a'), video], { id: 'v' }, { index: 0 }, counter());
    expect(change?.blocks[0]).toBe(video);
  });
});

describe('parentId', () => {
  it('is the columns block of an inner block', () => {
    expect(parentId(blocks(), 'y')).toBe('c');
    expect(parentId(blocks(), 'z')).toBe('c');
  });
  it('is undefined for a top-level block and for one that is gone', () => {
    expect(parentId(blocks(), 'a')).toBeUndefined();
    expect(parentId(blocks(), 'c')).toBeUndefined();
    expect(parentId(blocks(), 'gone')).toBeUndefined();
  });
});

describe('canDropAt', () => {
  const column = { columnsId: 'c' };
  it('lets text, image and button into a column, nothing else', () => {
    const types: ArticleBlockType[] = ['text', 'image', 'gallery', 'button', 'columns', 'callout', 'divider', 'space'];
    expect(types.filter((type) => canDropAt({ type }, column))).toEqual(['text', 'image', 'button']);
    expect(canDropAt({ type: 'video' as ArticleBlockType }, column)).toBe(false);
  });
  it('lets every type onto the top level, also an unknown one', () => {
    expect(canDropAt({ type: 'gallery' }, {})).toBe(true);
    expect(canDropAt({ type: 'video' as ArticleBlockType, isColumnsChild: true }, {})).toBe(true);
  });
  it('lets only its own blocks onto the top level of a full article; its columns are not full', () => {
    expect(canDropAt({ type: 'text' }, {}, true)).toBe(true);
    expect(canDropAt({ type: 'text', isColumnsChild: true }, {}, true)).toBe(false);
    expect(canDropAt({ type: 'text', isNew: true }, {}, true)).toBe(false);
    expect(canDropAt({ type: 'text', isNew: true }, column, true)).toBe(true);
  });
});
