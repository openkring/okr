import { describe, expect, it } from 'vitest';

import { articleSectionValidations, createHistory, findBlock, record, undo, type EditorHistory } from '@okr/cms-section-util';
import type { ArticleBlock, ArticleSection, ColumnsBlock } from '@okr/shared-models';

import {
  affectedBlocks, changeSection, closeDecision, columnOfBlock, deviceFor, historyKey, isTypedInto, restore, selectIn, stateAfterChange, stepBack, stepForward, withColumnSize, withFieldDefaults, withUploadDetails,
  type EditorState,
} from './article-editor-modal.util';

const text = (id: string, html = `<p>${id}</p>`): ArticleBlock => ({ id, type: 'text', html });
const image = (id: string, url: string): ArticleBlock => ({ id, type: 'image', image: { url } }) as unknown as ArticleBlock;
const columns = (id: string, ...lists: unknown[][]): ArticleBlock =>
  ({ id, type: 'columns', columns: lists.map((blocks) => ({ size: 12 / lists.length, blocks })) }) as unknown as ArticleBlock;
const section = (blocks: ArticleBlock[], o: object = {}): ArticleSection => ({ okey: 's', type: 'article', title: 'T', properties: { images: [], blocks }, ...o }) as unknown as ArticleSection;
const state = (blocks: ArticleBlock[], o: Partial<EditorState> = {}): EditorState => ({ section: section(blocks), copiedFrom: {}, ...o });
const blocksOf = (s: EditorState | undefined): ArticleBlock[] => s?.section.properties.blocks as ArticleBlock[];
const ids = (s: EditorState | undefined): string[] => blocksOf(s).map((b) => b.id);
const opened = (...list: string[]): ReadonlySet<string> => new Set(list);

describe('withFieldDefaults', () => {
  it('a stored article without fields the suite requires has no error that the author could not see or mend', () => {
    const bare = { okey: 'a', type: 'article', properties: { blocks: [text('a')] } } as unknown as ArticleSection;
    expect(articleSectionValidations(bare).isValid()).toBe(false);
    expect(articleSectionValidations(withFieldDefaults(bare)).getErrors()).toEqual({});
  });

  it('null is missing too, what is set stays, also a wrong value', () => {
    const s = withFieldDefaults({ ...section([]), notes: null, roleNeeded: 'admin', isArchived: true, title: 5 } as unknown as ArticleSection) as unknown as Record<string, unknown>;
    expect(s).toMatchObject({ notes: '', roleNeeded: 'admin', isArchived: true, title: 5 });
  });

  it('does not hide an article that everybody could see, and does not touch its input', () => {
    const bare = section([]);
    expect(withFieldDefaults(bare).roleNeeded).toBe('');
    expect('roleNeeded' in bare).toBe(false);
  });

  it.each([undefined, null, ''])('does not open a new article with the role %j', (roleNeeded) => {
    expect(withFieldDefaults(section([], { roleNeeded }), true).roleNeeded).toBe('contentAdmin');
    expect(withFieldDefaults(section([], { roleNeeded: 'registered' }), true).roleNeeded).toBe('registered');
  });

  it('the same object when nothing is missing', () => {
    const full = withFieldDefaults(section([]));
    expect(withFieldDefaults(full)).toBe(full);
  });
});

describe('stateAfterChange', () => {
  it('takes the blocks and the selection, and keeps the rest of the section', () => {
    const before = state([text('a')], { selectedId: 'a' });
    const after = stateAfterChange(before, { blocks: [text('b')], selectedId: 'b' }, opened('a'));
    expect(ids(after)).toEqual(['b']);
    expect(after.selectedId).toBe('b');
    expect(after.section.title).toBe('T');
    expect(after.section.properties.images).toEqual([]);
    expect(ids(before)).toEqual(['a']);
  });

  it('a change without a selection selects nothing', () => {
    expect(stateAfterChange(state([text('a')], { selectedId: 'a' }), { blocks: [] }, opened('a')).selectedId).toBeUndefined();
  });

  it('keeps the very same map when nothing was copied', () => {
    const before = state([text('a')], { copiedFrom: { x: 'a' } });
    expect(stateAfterChange(before, { blocks: [] }, opened('a')).copiedFrom).toBe(before.copiedFrom);
  });

  it('turns copies around: new id → source, inner blocks included', () => {
    const after = stateAfterChange(state([]), { blocks: [], copies: { c: 'c2', x: 'x2' } }, opened('c', 'x'));
    expect(after.copiedFrom).toEqual({ c2: 'c', x2: 'x' });
  });

  it('never overwrites a mapping', () => {
    const after = stateAfterChange(state([], { copiedFrom: { a2: 'a' } }), { blocks: [], copies: { b: 'a2' } }, opened('a', 'b'));
    expect(after.copiedFrom).toEqual({ a2: 'a' });
  });

  it('a join into a text of the opened article is no origin', () => {
    expect(stateAfterChange(state([]), { blocks: [], copies: { b: 'a' } }, opened('a', 'b')).copiedFrom).toEqual({});
  });

  it('a join into a new text is its origin', () => {
    expect(stateAfterChange(state([]), { blocks: [], copies: { b: 'new' } }, opened('a', 'b')).copiedFrom).toEqual({ new: 'b' });
  });

  it('an undone copy leaves no mapping, redone it is there again', () => {
    const start = createHistory(state([text('a')]));
    const copied = record(start, stateAfterChange(start.present, { blocks: [text('a'), text('a2')], selectedId: 'a2', copies: { a: 'a2' } }, opened('a')));
    expect(copied.present.copiedFrom).toEqual({ a2: 'a' });
    const undone = stepBack(copied);
    expect(undone.present.copiedFrom).toEqual({});
    expect(stepForward(undone).present.copiedFrom).toEqual({ a2: 'a' });
  });
});

describe('changeSection', () => {
  it('records a step and keeps the selection and the copies', () => {
    const h = createHistory(state([text('a')], { selectedId: 'a', copiedFrom: { a: 'x' } }));
    const next = changeSection(h, section([text('a')], { title: 'U' }));
    expect(next.present.section.title).toBe('U');
    expect(next.present.selectedId).toBe('a');
    expect(next.present.copiedFrom).toEqual({ a: 'x' });
    expect(next.past).toHaveLength(1);
  });

  it('the same section is no step', () => {
    const h = createHistory(state([text('a')]));
    expect(changeSection(h, h.present.section)).toBe(h);
  });

  it('a run with one tag is one step', () => {
    const h = createHistory(state([text('a')]));
    const one = changeSection(h, section([], { title: '1' }), 'article:title');
    const two = changeSection(one, section([], { title: '2' }), 'article:title');
    expect(two.past).toHaveLength(1);
    expect(changeSection(two, section([], { title: '3' })).past).toHaveLength(2);
  });

  it('drops a selection that is gone', () => {
    const h = createHistory(state([text('a')], { selectedId: 'a' }));
    expect(changeSection(h, section([])).present.selectedId).toBeUndefined();
  });
});

describe('restore', () => {
  it('is a step that can be undone, without the copies made since, and keeps a selection that exists', () => {
    const start = state([text('a')]);
    const h = record(createHistory(start), state([text('a', 'x'), text('a2')], { selectedId: 'a', copiedFrom: { a2: 'a' } }));
    const restored = restore(h, start);
    expect(restored.present).toEqual({ ...start, selectedId: 'a' });
    expect(restored.past).toHaveLength(2);
    expect(stepBack(restored).present).toBe(h.present);
  });

  it('drops a selection that does not exist there', () => {
    const h = record(createHistory(state([text('a')])), state([text('a'), text('b')], { selectedId: 'b' }));
    expect(restore(h, state([text('a')])).present.selectedId).toBeUndefined();
  });
});

describe('selectIn', () => {
  it('is no step, and the step after it goes back to it', () => {
    const h = selectIn(createHistory(state([text('a'), text('b')])), 'b');
    expect(h.past).toEqual([]);
    expect(h.present.selectedId).toBe('b');
    const typed = changeSection(h, section([text('a'), text('b', 'x')]));
    expect(stepBack(typed).present.selectedId).toBe('b');
  });

  it('the same selection changes nothing', () => {
    const h = createHistory(state([text('a')], { selectedId: 'a' }));
    expect(selectIn(h, 'a')).toBe(h);
  });

  it('ignores an id that does not exist', () => {
    expect(selectIn(createHistory(state([text('a')])), 'zzz').present.selectedId).toBeUndefined();
  });
});

describe('stepBack and stepForward', () => {
  it('keep a selection that exists and drop one that does not', () => {
    const start = createHistory(state([text('a'), text('b')], { selectedId: 'b' }));
    const removed = record(start, { ...start.present, section: section([text('a')]), selectedId: undefined });
    expect(stepBack(removed).present.selectedId).toBe('b');
    // a selection made at a time when the block existed
    const stale: EditorHistory<EditorState> = { past: [{ ...start.present, section: section([text('a')]) }], present: start.present, future: [] };
    expect(stepBack(stale).present).toEqual({ section: section([text('a')]), copiedFrom: {}, selectedId: undefined });
  });

  it('a selection inside a removed column', () => {
    const start = createHistory(state([columns('c', [text('x')], [text('y')])], { selectedId: 'y' }));
    const removed = changeSection(start, section([columns('c', [text('x')])]));
    expect(removed.present.selectedId).toBeUndefined();
    expect(stepBack(removed).present.selectedId).toBe('y');
  });

  it('without a step nothing changes', () => {
    const h = createHistory(state([text('a')]));
    expect(stepBack(h)).toBe(h);
    expect(stepForward(h)).toBe(h);
  });

  it('the state of a step is the very one that was recorded when its selection is valid', () => {
    const h = changeSection(createHistory(state([text('a')], { selectedId: 'a' })), section([text('a', 'x')]));
    expect(stepBack(h).present).toBe(undo(h).present);
  });
});

describe('affectedBlocks', () => {
  const of = (before: ArticleBlock[], after: ArticleBlock[]): string[] => affectedBlocks(before, after);

  it.each<[string, ArticleBlock[], ArticleBlock[], string[]]>([
    ['nothing', [text('a')], [text('a')], []],
    ['a changed text', [text('a'), text('b', 'x')], [text('a'), text('b', 'y')], ['b']],
    ['a block that came', [text('a')], [text('a'), text('b')], ['b']],
    ['a block that is gone', [text('a'), text('b')], [text('a')], []],
    ['two texts that were one', [text('a', 'ab')], [text('a', 'a'), text('b', 'b')], ['a', 'b']],
    ['an inner block changed, not its columns', [columns('c', [text('x', '1')], [])], [columns('c', [text('x', '2')], [])], ['x']],
    ['an inner block that came', [columns('c', [], [])], [columns('c', [text('x')], [])], ['x']],
    ['columns and their blocks that came', [], [columns('c', [text('x')], [])], ['c', 'x']],
    ['a column less', [columns('c', [], [], [])], [columns('c', [], [])], ['c']],
    ['moved to the end', [text('a'), text('b'), text('c')], [text('b'), text('c'), text('a')], ['a']],
    ['moved up', [text('a'), text('b'), text('c')], [text('c'), text('a'), text('b')], ['c']],
    ['neighbours changed places: either', [text('a'), text('b')], [text('b'), text('a')], ['b', 'a']],
    ['moved into a column', [text('x'), columns('c', [], [])], [columns('c', [text('x')], [])], ['x']],
    ['moved out of a column', [columns('c', [text('x')], [])], [text('x'), columns('c', [], [])], ['x']],
    ['moved to the other column', [columns('c', [text('x')], [])], [columns('c', [], [text('x')])], ['x']],
    ['moved and another inner one stays', [columns('c', [text('x'), text('y')], [])], [columns('c', [text('y'), text('x')], [])], ['y', 'x']],
  ])('%s', (_name, before, after, expected) => expect(of(before, after)).toEqual(expected));

  it('malformed blocks do not throw', () => {
    const bad = [null, 3, { id: 'c', type: 'columns', columns: 'x' }, { id: 'd', type: 'columns', columns: [null, { blocks: 'x' }, { blocks: [null] }] }] as unknown as ArticleBlock[];
    expect(of(bad, structuredClone(bad))).toEqual([]);
    expect(of([], bad)).toEqual(['c', 'd']);
  });
});

describe('undo and redo select what changes (§7.7)', () => {
  it('undo of a change made while another block was selected', () => {
    const start = createHistory(state([image('i', ''), text('b')], { selectedId: 'b' }));
    const uploaded = changeSection(start, section([image('i', 'u.jpg'), text('b')]));
    expect(uploaded.present.selectedId).toBe('b');
    expect(stepBack(uploaded).present.selectedId).toBe('i');
    expect(stepForward(stepBack(uploaded)).present.selectedId).toBe('i');
  });

  it('redo does not go to what was selected at the undo', () => {
    const typed = changeSection(createHistory(state([text('a', '1'), text('b')], { selectedId: 'a' })), section([text('a', '2'), text('b')]));
    const undone = stepBack(selectIn(typed, 'b'));
    expect(undone.present.selectedId).toBe('a');
    expect(stepForward(selectIn(undone, 'b')).present.selectedId).toBe('a');
  });

  it('of several, the one selected then', () => {
    const two = [text('a', 'a'), text('b', 'b')];
    const joined = record(createHistory(state(two, { selectedId: 'b' })), state([text('a', 'ab')], { selectedId: 'a' }));
    expect(stepBack(joined).present.selectedId).toBe('b');
  });

  it('undo of an added block goes back to what was selected, redo selects the block', () => {
    const start = createHistory(state([text('a')], { selectedId: 'a' }));
    const added = record(start, state([text('a'), text('b')], { selectedId: 'b' }));
    expect(stepBack(added).present.selectedId).toBe('a');
    expect(stepForward(stepBack(added)).present.selectedId).toBe('b');
  });

  it('redo of a deletion selects nothing', () => {
    const start = createHistory(state([text('a'), text('b')], { selectedId: 'b' }));
    const removed = selectIn(record(start, state([text('a')])), 'a');
    expect(stepForward(stepBack(removed)).present.selectedId).toBeUndefined();
  });

  it('a change of the article itself shows the article', () => {
    const start = createHistory(state([text('a')]));
    const titled = selectIn(changeSection(start, section([text('a')], { title: 'U' })), 'a');
    const undone = stepBack(titled);
    expect(undone.present.selectedId).toBeUndefined();
    expect(stepForward(selectIn(undone, 'a')).present.selectedId).toBeUndefined();
  });
});

describe('withUploadDetails', () => {
  const details = { kind: 'details' as const, details: [{ url: 'u.jpg', documentKey: 'd1' }] };
  const keyOf = (s: EditorState): unknown => (blocksOf(s)[0] as unknown as { image: { documentKey?: string } }).image.documentKey;

  it('fills every state, without a step', () => {
    const past = state([image('i', 'u.jpg')]);
    const h: EditorHistory<EditorState> = { past: [past, state([])], present: state([image('i', 'u.jpg')]), future: [state([image('i', 'u.jpg')])] };
    const next = withUploadDetails(h, details);
    expect([next.past.length, next.future.length]).toEqual([2, 1]);
    expect([keyOf(next.past[0]), keyOf(next.present), keyOf(next.future[0])]).toEqual(['d1', 'd1', 'd1']);
    expect(next.past[1]).toBe(h.past[1]);
    expect(keyOf(past)).toBeUndefined();
  });

  it('keeps a typing run going', () => {
    const h: EditorHistory<EditorState> = { ...createHistory(state([image('i', 'u.jpg')])), tag: 'text:a', at: 5 };
    expect(withUploadDetails(h, details)).toMatchObject({ tag: 'text:a', at: 5 });
  });

  it('keeps the copies and the selection', () => {
    const h = createHistory(state([image('i', 'u.jpg')], { selectedId: 'i', copiedFrom: { i: 'z' } }));
    expect(withUploadDetails(h, details).present).toMatchObject({ selectedId: 'i', copiedFrom: { i: 'z' } });
  });

  it('changes nothing when the picture is not used', () => {
    const h = createHistory(state([image('i', 'other.jpg')]));
    expect(withUploadDetails(h, details).present).toBe(h.present);
  });
});

describe('columnOfBlock and withColumnSize', () => {
  const three = (): ArticleBlock[] => [text('a'), columns('c', [text('x')], [image('i', 'u')], [])];
  const sizes = (blocks: ArticleBlock[] | undefined, id: string): number[] => (findBlock(blocks ?? [], id)?.block as ColumnsBlock).columns.map((c) => c?.size);

  it('tells size and number of columns of an inner block', () => {
    expect(columnOfBlock(three(), 'i')).toEqual({ size: 4, count: 3 });
    expect(columnOfBlock(three(), 'a')).toBeUndefined();
    expect(columnOfBlock(three(), 'c')).toBeUndefined();
    expect(columnOfBlock(three(), 'nothing')).toBeUndefined();
  });

  it('gives its column the size, the others take the rest', () => {
    expect(sizes(withColumnSize(three(), 'i', 6), 'c')).toEqual([4, 6, 2]);
  });

  it('the same blocks when nothing changes or it stands in no column', () => {
    const blocks = three();
    expect(withColumnSize(blocks, 'i', 4)).toBe(blocks);
    expect(withColumnSize(blocks, 'i', 99)).toBe(blocks);
    expect(withColumnSize(blocks, 'a', 6)).toBe(blocks);
  });

  it('malformed columns do not shift the column', () => {
    const stored = { id: 'c', type: 'columns', columns: [null, { size: 4, blocks: [text('x')] }, { size: 8, blocks: [image('i', 'u')] }] } as unknown as ArticleBlock;
    expect(columnOfBlock([stored], 'i')).toEqual({ size: 8, count: 2 });
    expect(sizes(withColumnSize([stored], 'i', 6), 'c')).toEqual([6, 6]);
  });
});

describe('deviceFor', () => {
  it('a phone shows the real viewport, whatever was chosen', () => {
    expect(deviceFor('tablet', true)).toBe('auto');
    expect(deviceFor('tablet', false)).toBe('tablet');
    expect(deviceFor('desktop', false)).toBe('desktop');
  });
});

describe('historyKey', () => {
  const key = (k: string, o: object = {}): KeyboardEvent => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, ...o }) as KeyboardEvent;

  it.each<[string, KeyboardEvent, 'undo' | 'redo' | undefined]>([
    ['Cmd+Z', key('z', { metaKey: true }), 'undo'],
    ['Ctrl+Z', key('z', { ctrlKey: true }), 'undo'],
    ['Ctrl+Z with caps lock', key('Z', { ctrlKey: true }), 'undo'],
    ['Shift+Cmd+Z', key('Z', { metaKey: true, shiftKey: true }), 'redo'],
    ['Shift+Ctrl+Z', key('z', { ctrlKey: true, shiftKey: true }), 'redo'],
    ['Ctrl+Y', key('y', { ctrlKey: true }), 'redo'],
    ['Cmd+Y', key('y', { metaKey: true }), undefined],
    ['Shift+Ctrl+Y', key('y', { ctrlKey: true, shiftKey: true }), undefined],
    ['Z', key('z'), undefined],
    ['Alt+Cmd+Z', key('z', { metaKey: true, altKey: true }), undefined],
    ['while composing', key('z', { metaKey: true, isComposing: true }), undefined],
    ['another key', key('b', { metaKey: true }), undefined],
  ])('%s', (_name, event, expected) => expect(historyKey(event)).toBe(expected));
});

describe('isTypedInto', () => {
  const el = (tagName: string, o: object = {}): Element => ({ tagName, ...o }) as unknown as Element;

  it.each<[string, Element, boolean]>([
    ['a text field', el('INPUT', { type: 'text' }), true],
    ['a number field', el('INPUT', { type: 'number' }), true],
    ['a textarea', el('TEXTAREA'), true],
    ['an editable text', el('DIV', { isContentEditable: true }), true],
    ['a checkbox', el('INPUT', { type: 'checkbox' }), false],
    ['a slider', el('INPUT', { type: 'range' }), false],
    ['a button', el('BUTTON'), false],
  ])('%s', (_name, element, expected) => expect(isTypedInto(element)).toBe(expected));
});

describe('closeDecision', () => {
  it.each([
    [{ done: false, saving: false, changed: false }, 'allow'],
    [{ done: false, saving: false, changed: true }, 'ask'],
    [{ done: false, saving: true, changed: true }, 'refuse'],
    [{ done: false, saving: true, changed: false }, 'refuse'],
    [{ done: true, saving: false, changed: true }, 'allow'],
    [{ done: true, saving: true, changed: true }, 'allow'],
  ])('%j → %s', (situation, expected) => expect(closeDecision(situation)).toBe(expected));
});
