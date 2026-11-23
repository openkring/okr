import { describe, expect, it } from 'vitest';

import { ArticleSection } from '@okr/shared-models';

import {
  ArticleEditorState, HISTORY_MAX, TYPING_PAUSE, createHistory, record, redo, replacePresent, undo, withValidSelection,
} from './article-editor-history.util';

const columns = (id: string, cols: { id: string; type: string }[][]) =>
  ({ id, type: 'columns', columns: cols.map((blocks) => ({ size: 6, blocks })) });
const text = (id: string) => ({ id, type: 'text', html: '<p>x</p>' });
const sectionOf = (blocks: unknown[]) => ({ id: 's', type: 'article', properties: { blocks } }) as unknown as ArticleSection;

describe('article editor history', () => {
  it('undo then redo gives back the same objects', () => {
    const a = { v: 'a' }; const b = { v: 'b' };
    const h = record(createHistory(a), b);
    const u = undo(h);
    expect(u.present).toBe(a);
    expect(u.future).toEqual([b]);
    const r = redo(u);
    expect(r.present).toBe(b);
    expect(r.past).toEqual([a]);
    expect(r.future).toEqual([]);
  });

  it('a record after undo drops the future', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'];
    const u = undo(record(record(createHistory(a), b), c));
    expect(u.future).toEqual([c]);
    const r = record(u, d);
    expect(r.present).toBe(d);
    expect(r.past).toEqual([a, b]);
    expect(r.future).toEqual([]);
  });

  it('same tag within the typing pause of the last record is one step, measured from the last record', () => {
    const h0 = createHistory('a');
    const h1 = record(h0, 'b', { tag: 'text:b1', at: 1000 });
    const h2 = record(h1, 'c', { tag: 'text:b1', at: 1000 + TYPING_PAUSE - 100 });
    const h3 = record(h2, 'd', { tag: 'text:b1', at: 1000 + 2 * (TYPING_PAUSE - 100) });
    expect(TYPING_PAUSE).toBe(1000);
    expect(h3.past).toEqual(['a']);
    expect(h3.present).toBe('d');
  });

  it('a gap longer than the typing pause starts a new step', () => {
    const h1 = record(createHistory('a'), 'b', { tag: 'text:b1', at: 1000 });
    const h2 = record(h1, 'c', { tag: 'text:b1', at: 2100 });
    expect(h2.past).toEqual(['a', 'b']);
    expect(h2.present).toBe('c');
  });

  it('different tags are two steps', () => {
    const h1 = record(createHistory('a'), 'b', { tag: 'text:b1', at: 1000 });
    const h2 = record(h1, 'c', { tag: 'text:b2', at: 1100 });
    expect(h2.past).toEqual(['a', 'b']);
  });

  it('an undo ends a run', () => {
    const h1 = record(createHistory('a'), 'b', { tag: 't', at: 0 });
    const h2 = record(h1, 'c', { tag: 't', at: 500 });
    expect(h2.past).toEqual(['a']);
    const back = redo(undo(h2));
    expect(back.present).toBe('c');
    const h3 = record(back, 'd', { tag: 't', at: 600 });
    expect(h3.past).toEqual(['a', 'c']);
    expect(h3.present).toBe('d');
  });

  it('an untagged record ends a run', () => {
    const h1 = record(createHistory('a'), 'b', { tag: 't', at: 0 });
    const h2 = record(h1, 'c', { at: 500 });
    const h3 = record(h2, 'd', { tag: 't', at: 600 });
    expect(h3.past).toEqual(['a', 'b', 'c']);
  });

  it('a record without at uses the current time', () => {
    const before = Date.now();
    const h = record(createHistory('a'), 'b', { tag: 't' });
    expect(h.at).toBeGreaterThanOrEqual(before);
    expect(h.at).toBeLessThanOrEqual(Date.now());
  });

  it('keeps at most HISTORY_MAX steps in past', () => {
    expect(HISTORY_MAX).toBe(100);
    let h = createHistory(0);
    for (let i = 1; i <= 101; i++) h = record(h, i);
    expect(h.past.length).toBe(HISTORY_MAX);
    expect(h.past[0]).toBe(1);
    expect(h.present).toBe(101);
  });

  it('undo and redo at the ends return the same object', () => {
    const start = createHistory('a');
    expect(undo(start)).toBe(start);
    expect(redo(start)).toBe(start);
    const end = record(start, 'b');
    expect(redo(end)).toBe(end);
  });

  it('does not mutate the input history', () => {
    const h = record(createHistory('a'), 'b');
    const snapshot = JSON.stringify(h);
    record(h, 'c');
    undo(h);
    redo(undo(h));
    replacePresent(h, 'z');
    expect(JSON.stringify(h)).toBe(snapshot);
  });

  it('replacePresent adds no step and keeps past, future, tag and at', () => {
    const h = record(createHistory('a'), 'b', { tag: 't', at: 0 });
    const r = replacePresent(h, 'c');
    expect(r.present).toBe('c');
    expect(r.past).toEqual(h.past);
    expect(r.future).toEqual(h.future);
    expect(r.tag).toBe('t');
    expect(r.at).toBe(0);
    const merged = record(r, 'd', { tag: 't', at: 500 });
    expect(merged.past).toEqual(['a']);
  });

  it('replacePresent keeps the future', () => {
    const u = undo(record(createHistory('a'), 'b'));
    expect(replacePresent(u, 'z').future).toEqual(['b']);
  });
});

describe('withValidSelection', () => {
  const inner = { id: 'd', type: 'text', html: '<p>d</p>' };
  const blocks = [text('t'), columns('c', [[text('a')], [inner]])];

  it('returns the same object when the selected block exists, top level or inner', () => {
    const state: ArticleEditorState = { section: sectionOf(blocks), selectedId: 't' };
    expect(withValidSelection(state)).toBe(state);
    const inside: ArticleEditorState = { section: sectionOf(blocks), selectedId: 'd' };
    expect(withValidSelection(inside)).toBe(inside);
  });

  it('returns the same object when nothing is selected', () => {
    const state: ArticleEditorState = { section: sectionOf(blocks) };
    expect(withValidSelection(state)).toBe(state);
  });

  it('clears the id of a deleted block', () => {
    const r = withValidSelection({ section: sectionOf([text('t')]), selectedId: 'gone' });
    expect(r.selectedId).toBeUndefined();
    expect(r.section.properties.blocks).toEqual([text('t')]);
  });

  it('clears the id of an inner block of a removed column', () => {
    const withoutColumns = [text('t')];
    const r = withValidSelection({ section: sectionOf(withoutColumns), selectedId: 'd' });
    expect(r.selectedId).toBeUndefined();
  });

  it('tolerates a section without properties or blocks', () => {
    const bare = { id: 's', type: 'article' } as unknown as ArticleSection;
    expect(withValidSelection({ section: bare, selectedId: 'x' }).selectedId).toBeUndefined();
    const broken = { id: 's', type: 'article', properties: {} } as unknown as ArticleSection;
    expect(withValidSelection({ section: broken, selectedId: 'x' }).selectedId).toBeUndefined();
  });
});
