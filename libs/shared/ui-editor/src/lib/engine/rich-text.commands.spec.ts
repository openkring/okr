import { describe, expect, it } from 'vitest';
import { Command, EditorState, NodeSelection, TextSelection } from 'prosemirror-state';

import {
  activeAlign, activeBlockLevel, activeColor, caretSelection, endsWithEmptyParagraph, indent, inTaskItem, isAtVeryStart, isMarkActive,
  removeEmptyLastParagraph, setAlign, setBlockLevel, setColor, setLink, splitItem,
  toggleBlockquote, toggleChecked, toggleList, toggleMarkCommand, toggleTaskItem,
} from './rich-text.commands';
import { docToMarkdown, markdownToDoc } from './rich-text.markdown';
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

  describe('task items', () => {
    const md = (markdown: string, from: number) => {
      const state = EditorState.create({ schema, doc: markdownToDoc(markdown) });
      return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from)));
    };
    const out = (state: EditorState) => docToMarkdown(state.doc);

    it('turns a paragraph into an unchecked task, and back into a plain item', () => {
      const task = run(md('einkaufen', 2), toggleTaskItem());
      expect(out(task)).toBe('- [ ] einkaufen');
      expect(inTaskItem(task)).toBe(true);
      expect(out(run(task, toggleTaskItem()))).toBe('- einkaufen');
    });

    it('ticks and unticks an item by its position', () => {
      const state = md('- [ ] a\n- [x] b', 3);
      expect(out(run(state, toggleChecked(1)))).toBe('- [x] a\n- [x] b');
      expect(run(state, toggleChecked(0))).toBe(state);   // not a list item: nothing happens
    });

    it('starts a new item after a ticked one unchecked', () => {
      // '- [x] erledigt': the item's text ends at 11
      expect(out(run(md('- [x] erledigt', 11), splitItem()))).toBe('- [x] erledigt\n- [ ] ');
    });
  });
});

describe('editing texts block by block (1.175)', () => {
  /** `<p>a</p><p></p>`: 0 <p> 1 a 2 </p> 3 <p> 4 </p> 5 */
  const TWO = '<p>a</p><p></p>';

  describe('endsWithEmptyParagraph', () => {
    it('is true with the cursor in an empty last paragraph', () => {
      expect(endsWithEmptyParagraph(stateOf(TWO, 4))).toBe(true);
    });

    it('is false for a text that is one empty paragraph', () => {
      expect(endsWithEmptyParagraph(stateOf('<p></p>', 1))).toBe(false);
    });

    it('is false in an empty item of a list at the end', () => {
      // 0 <p> 1 a 2 </p> 3 <ul> 4 <li> 5 <p> 6
      expect(endsWithEmptyParagraph(stateOf('<p>a</p><ul><li><p></p></li></ul>', 6))).toBe(false);
    });

    it('is false in an empty paragraph of a quote at the end', () => {
      expect(endsWithEmptyParagraph(stateOf('<p>a</p><blockquote><p></p></blockquote>', 5))).toBe(false);
    });

    it('is false with a selection', () => {
      expect(endsWithEmptyParagraph(stateOf(TWO, 1, 4))).toBe(false);
    });

    it('is false in an empty paragraph in the middle and in a last paragraph with text', () => {
      expect(endsWithEmptyParagraph(stateOf('<p>a</p><p></p><p>b</p>', 4))).toBe(false);
      expect(endsWithEmptyParagraph(stateOf('<p>a</p><p>b</p>', 4))).toBe(false);
    });

    it('is false in an empty heading at the end', () => {
      expect(endsWithEmptyParagraph(stateOf('<p>a</p><h2></h2>', 4))).toBe(false);
    });
  });

  describe('removeEmptyLastParagraph', () => {
    it('takes the paragraph away and leaves the cursor at the end of the text', () => {
      const next = run(stateOf(TWO, 4), removeEmptyLastParagraph());
      expect(html(next)).toBe('<p>a</p>');
      expect(next.selection.from).toBe(2);
    });

    it('does nothing elsewhere', () => {
      expect(removeEmptyLastParagraph()(stateOf(TWO, 1))).toBe(false);
      expect(html(run(stateOf(TWO, 1), removeEmptyLastParagraph()))).toBe(TWO);
    });
  });

  describe('isAtVeryStart', () => {
    it('is true at the start of a paragraph and of a heading', () => {
      expect(isAtVeryStart(stateOf('<p>a</p>', 1))).toBe(true);
      expect(isAtVeryStart(stateOf('<h2>a</h2><p>b</p>', 1))).toBe(true);
      expect(isAtVeryStart(stateOf('<p></p>', 1))).toBe(true);
    });

    it('is false in a list item and in a quote', () => {
      expect(isAtVeryStart(stateOf('<ul><li><p>a</p></li></ul>', 3))).toBe(false);
      expect(isAtVeryStart(stateOf('<blockquote><p>a</p></blockquote>', 2))).toBe(false);
    });

    it('is false after one character and in a later paragraph', () => {
      expect(isAtVeryStart(stateOf('<p>ab</p>', 2))).toBe(false);
      expect(isAtVeryStart(stateOf(TWO, 4))).toBe(false);
    });

    it('is false with a selection', () => {
      expect(isAtVeryStart(stateOf('<p>ab</p>', 1, 2))).toBe(false);
      const state = stateOf('<p><img src="https://a.test/x.png"></p>', 1);
      expect(isAtVeryStart(state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 1))))).toBe(false);
    });
  });

  describe('caretSelection', () => {
    /** The cursor position for `caret` in `text`. */
    const at = (text: string, caret: Parameters<typeof caretSelection>[1]) => {
      const selection = caretSelection(htmlToDoc(text), caret);
      expect(selection.empty).toBe(true);
      return selection.from;
    };

    it('finds the start and the end of the text', () => {
      expect(at('<p>ab</p><p>cd</p>', 'start')).toBe(1);
      expect(at('<p>ab</p><p>cd</p>', 'end')).toBe(7);
      expect(at('<p>ab</p><hr>', 'end')).toBe(3);             // the cursor needs a text: the one before the line
      expect(at('<ul><li><p>ab</p></li></ul>', 'end')).toBe(5);
      expect(at('', 'end')).toBe(1);
    });

    it('stands after the upper of two joined texts', () => {
      expect(at('<p>ab</p><p>cd</p>', { afterHtml: '<p>ab</p>' })).toBe(3);
      expect(at('<p>ab</p><p>cd</p><p>e</p>', { afterHtml: '<p>ab</p><p>cd</p>' })).toBe(7);
      expect(at('<ul><li><p>ab</p></li></ul><p>c</p>', { afterHtml: '<ul><li><p>ab</p></li></ul>' })).toBe(5);
      expect(at('<p>ab</p><hr><p>cd</p>', { afterHtml: '<p>ab</p><hr>' })).toBe(6);
    });

    it('stands inside a paragraph into which both texts were merged', () => {
      expect(at('<p>abcd</p>', { afterHtml: '<p>ab</p>' })).toBe(3);
    });

    it('reads the upper text as the editor does', () => {
      expect(at('<p><strong>ab</strong></p><p>cd</p>', { afterHtml: '<p><b>ab</b></p>' })).toBe(3);
    });

    it('stands at the start when the upper text was empty', () => {
      expect(at('<p>cd</p>', { afterHtml: '' })).toBe(1);
      expect(at('<p></p><p>cd</p>', { afterHtml: '<p></p>' })).toBe(1);
    });

    it('stands at the start before a list or a heading when the upper text was empty', () => {
      for (const afterHtml of ['', '<p></p>', '<h2></h2>']) {
        expect(at('<ul><li><p>cd</p></li></ul>', { afterHtml })).toBe(3);
        expect(at('<h2>cd</h2><p>e</p>', { afterHtml })).toBe(1);
        expect(at('<p>cd</p><p>e</p>', { afterHtml })).toBe(1);
      }
    });

    it('falls back to the end when the upper text is not there', () => {
      expect(at('<p>ab</p><p>cd</p>', { afterHtml: '<p>xy</p>' })).toBe(7);
      expect(at('<p>ab</p>', { afterHtml: '<p>ab</p><p>cd</p>' })).toBe(3);
      expect(at('<p>abc</p>', { afterHtml: '<p><strong>ab</strong></p>' })).toBe(4);
    });
  });
});
