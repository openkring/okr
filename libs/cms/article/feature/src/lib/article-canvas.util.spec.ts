import { describe, expect, it } from 'vitest';

import type { ArticleBlock, ArticleBlockType } from '@okr/shared-models';

import { canDropAt, classicButtonId, dragPoint, dropChange, isClassicText, isTextual, kindOf, mayEnterList, neighbourId, parentId } from './article-canvas.util';

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
    expect(dropChange(blocks(), { newType: 'events' as ArticleBlockType }, { index: 0 }, counter())).toBeUndefined();   // of a mail only
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

describe('mayEnterList', () => {
  const inner = { type: 'text' as ArticleBlockType, isColumnsChild: true };
  const state = { full: false, switching: false, isOverOwnColumn: () => true };
  // the CDK does not count the list a block comes from among its candidates: the top level around it would always take it
  it('keeps a block of a column in it while the pointer is over that column', () => {
    expect(mayEnterList(inner, {}, state)).toBe(false);
    expect(mayEnterList(inner, {}, { ...state, isOverOwnColumn: () => false })).toBe(true);
  });
  // between leaving one list and entering the next the CDK asks whether a list can receive at all (it measures only those)
  it('says yes while lists are being switched', () => {
    expect(mayEnterList(inner, {}, { ...state, switching: true })).toBe(true);
  });
  it('lets it into another column, wherever the pointer is', () => {
    expect(mayEnterList(inner, { columnsId: 'c' }, state)).toBe(true);
  });
  it('asks for the pointer only where it matters', () => {
    const never = (): boolean => { throw new Error('asked'); };
    expect(mayEnterList({ type: 'text' }, {}, { ...state, isOverOwnColumn: never })).toBe(true);
    expect(mayEnterList({ type: 'text', isNew: true }, {}, { ...state, isOverOwnColumn: never })).toBe(true);
    expect(mayEnterList(inner, {}, { ...state, switching: true, isOverOwnColumn: never })).toBe(true);
    expect(mayEnterList(inner, { columnsId: 'c' }, { ...state, isOverOwnColumn: never })).toBe(true);
  });
  it('refuses what does not fit, also while lists are being switched', () => {
    expect(mayEnterList({ type: 'gallery' }, { columnsId: 'c' }, { ...state, switching: true })).toBe(false);
    expect(mayEnterList(inner, {}, { ...state, full: true, switching: true })).toBe(false);
    expect(mayEnterList({}, {}, state)).toBe(false);
  });
});

describe('dragPoint', () => {
  const block = { top: 100, height: 58 };
  const start = { x: 50, y: 85 };  // on the handle, above the block
  it('begins inside the block, not on the one before it', () => {
    expect(dragPoint(start, start, block)).toEqual({ x: 50, y: 129 });
  });
  it('does not leave the block for a small movement in any direction', () => {
    for (const [dx, dy] of [[0, -24], [0, 24], [24, 0], [-24, 0], [-15, -15], [15, 15]]) {
      const { y } = dragPoint(start, { x: start.x + dx, y: start.y + dy }, block);
      expect(y).toBeGreaterThanOrEqual(block.top);
      expect(y).toBeLessThanOrEqual(block.top + block.height);
    }
  });
  it('is the pointer once that has moved away', () => {
    for (const [dx, dy] of [[0, 96], [0, -96], [100, 0], [400, 300]]) {
      const point = { x: start.x + dx, y: start.y + dy };
      expect(dragPoint(start, point, block)).toEqual(point);
    }
  });
  it('always goes the way the pointer goes', () => {
    let last = -Infinity;
    for (let y = start.y - 120; y <= start.y + 120; y++) {
      const point = dragPoint(start, { x: start.x, y }, block).y;
      expect(point).toBeGreaterThan(last);
      last = point;
    }
  });
  it('is the pointer from the start when the handle is inside the block (a long one, scrolled)', () => {
    const point = { x: 50, y: 400 };
    expect(dragPoint(point, point, { top: -200, height: 900 })).toEqual(point);
  });
  it('begins in the middle of a low block', () => {
    expect(dragPoint(start, start, { top: 100, height: 8 })).toEqual({ x: 50, y: 104 });
  });
});

describe('neighbourId', () => {
  const all = (): ArticleBlock[] => [text('a'), columns('c', [text('x'), text('y')], [text('z')]), gallery('g')];
  it('is the next block of the same list, else the one before', () => {
    expect(neighbourId(all(), 'a')).toBe('c');
    expect(neighbourId(all(), 'c')).toBe('g');
    expect(neighbourId(all(), 'g')).toBe('c');
    expect(neighbourId(all(), 'x')).toBe('y');
    expect(neighbourId(all(), 'y')).toBe('x');
  });
  it('is the columns block when the column gets empty', () => {
    expect(neighbourId(all(), 'z')).toBe('c');
  });
  it('is undefined for the only block and for one that is gone', () => {
    expect(neighbourId([text('a')], 'a')).toBeUndefined();
    expect(neighbourId(all(), 'gone')).toBeUndefined();
  });
});

describe('isClassicText and classicButtonId', () => {
  const button = (id: string): ArticleBlock => ({ id, type: 'button', cta: { label: 'l', url: '/x', style: 'primary' } });
  it('is a lone text, also an empty one, but not an aligned one', () => {
    expect(isClassicText([text('a')], false)).toBe(true);
    expect(isClassicText([text('a', '')], false)).toBe(true);
    expect(isClassicText([{ ...text('a'), align: 'left' } as ArticleBlock], false)).toBe(true);
    expect(isClassicText([{ ...text('a'), align: 'center' } as ArticleBlock], true)).toBe(false);
    expect(isClassicText([gallery('g')], false)).toBe(false);
    expect(isClassicText([], false)).toBe(false);
  });
  it('is a text with a button under it, as long as the article is classic', () => {
    expect(isClassicText([text('a'), button('b')], false)).toBe(true);
    expect(isClassicText([text('a'), button('b')], true)).toBe(false);
    expect(isClassicText([text('a'), text('b')], true)).toBe(false);
    expect(isClassicText([text('a'), button('b'), text('c')], true)).toBe(false);
  });
  it('is the last block of a classic article when that is a button', () => {
    expect(classicButtonId([gallery('g'), text('a'), button('b')], false)).toBe('b');
    expect(classicButtonId([text('a'), button('b')], true)).toBeUndefined();
    expect(classicButtonId([button('b'), text('a')], false)).toBeUndefined();
    expect(classicButtonId([], false)).toBeUndefined();
  });
});

describe('kindOf and isTextual', () => {
  const ofType = (type: unknown): ArticleBlock => ({ id: 'a', type }) as unknown as ArticleBlock;
  it('knows columns, the blocks of the app, and those it does not know', () => {
    expect(kindOf(columns('c', [], []), false)).toBe('columns');
    expect(kindOf(gallery('g'), false)).toBe('block');
    for (const type of ['video', 'constructor', undefined, 5]) expect(kindOf(ofType(type), false)).toBe('unknown');
  });
  it('does not know in a column what readers do not see there', () => {
    expect(['text', 'image', 'button'].map((type) => kindOf(ofType(type), true))).toEqual(['block', 'block', 'block']);
    expect(['gallery', 'columns', 'callout', undefined].map((type) => kindOf(ofType(type), true))).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
  });
  it('texts and callouts are edited', () => {
    expect(isTextual(text('a'))).toBe(true);
    expect(isTextual(ofType('callout'))).toBe(true);
    expect(isTextual(ofType('button'))).toBe(false);
  });
});
