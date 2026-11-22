import { describe, expect, it } from 'vitest';
import { Command, EditorState, TextSelection } from 'prosemirror-state';

import {
  activeAlign, activeBlockLevel, activeColor, indent, isMarkActive, setAlign, setBlockLevel, setColor, setLink, toggleBlockquote,
  toggleList, toggleMarkCommand,
} from './rich-text.commands';
import { docToHtml, htmlToDoc } from './rich-text.html';
import { richTextSchema as schema } from './rich-text.schema';

/** A state for `html` with the selection from `from` to `to` (document positions). */
function stateOf(html: string, from: number, to = from): EditorState {
  const state = EditorState.create({ schema, doc: htmlToDoc(html) });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => { next = state.apply(tr); });
  return next;
}

const html = (state: EditorState) => docToHtml(state.doc);

// '<p>Hallo Welt</p>': positions 1..11 are the text, "Hallo" is 1..6
describe('rich-text commands', () => {
  it('toggles a mark on the selection and reports it active', () => {
    const bold = run(stateOf('<p>Hallo Welt</p>', 1, 6), toggleMarkCommand('strong'));
    expect(html(bold)).toBe('<p><strong>Hallo</strong> Welt</p>');
    expect(isMarkActive(bold, schema.marks['strong'])).toBe(true);
    expect(html(run(bold, toggleMarkCommand('strong')))).toBe('<p>Hallo Welt</p>');
  });

  it('turns a paragraph into a heading and back, keeping its alignment', () => {
    const centred = run(stateOf('<p>Titel</p>', 2), setAlign('center'));
    const heading = run(centred, setBlockLevel(2));
    expect(activeBlockLevel(heading)).toBe(2);
    expect(activeAlign(heading)).toBe('center');
    expect(activeBlockLevel(run(heading, setBlockLevel(0)))).toBe(0);
  });

  it('stores left alignment as no alignment', () => {
    const right = run(stateOf('<p>x</p>', 1), setAlign('right'));
    expect(activeAlign(right)).toBe('right');
    expect(html(run(right, setAlign('left')))).toBe('<p>x</p>');
  });

  it('indents a block in 40px steps and back to none', () => {
    const once = run(stateOf('<p>x</p>', 1), indent(1));
    expect(once.doc.firstChild?.attrs['indent']).toBe(1);
    expect(run(once, indent(-1)).doc.firstChild?.attrs['indent']).toBeNull();
    expect(run(stateOf('<p>x</p>', 1), indent(-1)).doc.firstChild?.attrs['indent']).toBeNull();
  });

  it('sets and removes a text colour', () => {
    const red = run(stateOf('<p>Hallo</p>', 1, 6), setColor('text_color', '#ff0000'));
    expect(activeColor(run(red, (s, d) => { d?.(s.tr.setSelection(TextSelection.create(s.doc, 3))); return true; }), 'text_color')).toBe('#ff0000');
    expect(html(run(red, setColor('text_color', null)))).toBe('<p>Hallo</p>');
  });

  it('links the selection, and changes the whole link from a cursor inside it', () => {
    const linked = run(stateOf('<p>Hallo Welt</p>', 1, 6), setLink('https://a.ch'));
    expect(html(linked)).toBe('<p><a href="https://a.ch" target="_blank">Hallo</a> Welt</p>');
    const cursorInside = linked.apply(linked.tr.setSelection(TextSelection.create(linked.doc, 3)));
    expect(html(run(cursorInside, setLink('https://b.ch')))).toBe('<p><a href="https://b.ch" target="_blank">Hallo</a> Welt</p>');
    expect(html(run(cursorInside, setLink(null)))).toBe('<p>Hallo Welt</p>');
  });

  it('inserts the URL as linked text when nothing is selected', () => {
    const inserted = run(stateOf('<p></p>', 1), setLink('https://a.ch'));
    expect(html(inserted)).toBe('<p><a href="https://a.ch" target="_blank">https://a.ch</a></p>');
  });

  it('wraps in a list, switches its type, and lifts out again', () => {
    const bullets = run(stateOf('<p>a</p>', 1), toggleList('bullet_list'));
    expect(html(bullets)).toBe('<ul><li><p>a</p></li></ul>');
    const numbered = run(bullets, toggleList('ordered_list'));
    expect(html(numbered)).toBe('<ol><li><p>a</p></li></ol>');
    expect(html(run(numbered, toggleList('ordered_list')))).toBe('<p>a</p>');
  });

  it('wraps in a blockquote and lifts out again', () => {
    const quoted = run(stateOf('<p>a</p>', 1), toggleBlockquote());
    expect(html(quoted)).toBe('<blockquote><p>a</p></blockquote>');
    expect(html(run(quoted, toggleBlockquote()))).toBe('<p>a</p>');
  });
});
