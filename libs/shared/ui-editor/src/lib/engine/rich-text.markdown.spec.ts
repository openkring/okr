import { describe, expect, it } from 'vitest';

import { docToHtml, htmlToDoc } from './rich-text.html';
import { docToMarkdown, editsFaithfully, EMPTY_MARKDOWN, markdownToDoc } from './rich-text.markdown';

const roundTrip = (markdown: string) => docToMarkdown(markdownToDoc(markdown));

/** Markdown as authors and the diary import write it: each must come back unchanged. */
const STORED_FORMS: Record<string, string> = {
  paragraph: 'Hallo Welt',
  twoParagraphs: 'eins\n\nzwei',
  lineBreakInParagraph: 'erste Zeile\nzweite Zeile',
  bold: '**fett**',
  italic: '*kursiv*',
  strike: '~~durch~~',
  code: 'mit `x = 1` darin',
  link: '[Seeclub](https://seeclub.org)',
  bareUrl: 'siehe https://example.org/a_b_c/d?x=1 dort',
  headings: '# Eins\n\n## Zwei\n\n### Drei',
  bulletList: '- a\n- b\n- c',
  starBulletList: '* a\n* b',
  orderedList: '1. eins\n2. zwei',
  looseList: '- a\n\n- b',
  nestedList: '- a\n  - a1\n- b',
  taskItems: '- [x] Rechnungen\n- [x] Steuern\n- [ ] Garten',
  quote: '> Zitat',
  codeBlock: '```\nlet a = 1;\n```',
  hr: 'oben\n\n---\n\nunten',
  placeholderComment: 'Text\n\n<!-- Platzhalter für Bilder -->',
  htmlImage: 'Bild: <img src="a.jpg" width="200"> fertig',
  inlineTagLike: 'Ein List<Element> im Text',
};

describe('rich-text markdown round trip', () => {
  for (const [name, markdown] of Object.entries(STORED_FORMS)) {
    it(`keeps ${name} unchanged`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it('gives one empty paragraph for empty input, and stores it as an empty string', () => {
    expect(markdownToDoc('').childCount).toBe(1);
    expect(markdownToDoc(undefined).firstChild?.type.name).toBe('paragraph');
    expect(docToMarkdown(markdownToDoc(''))).toBe(EMPTY_MARKDOWN);
  });

  it('reads task items as checked list items, not as text', () => {
    const item = markdownToDoc('- [x] erledigt').firstChild?.firstChild;
    expect(item?.attrs['checked']).toBe(true);
    expect(item?.textContent).toBe('erledigt');
    expect(markdownToDoc('- [ ] offen').firstChild?.firstChild?.attrs['checked']).toBe(false);
    expect(markdownToDoc('- normal').firstChild?.firstChild?.attrs['checked']).toBeNull();
  });

  it('keeps HTML as an opaque node instead of text', () => {
    const doc = markdownToDoc('a\n\n<!-- x -->');
    expect(doc.lastChild?.type.name).toBe('html_block');
    expect(doc.lastChild?.attrs['html']).toBe('<!-- x -->');
  });

  it('normalises equivalent markdown to one form', () => {
    expect(roundTrip('__fett__')).toBe('**fett**');
    expect(roundTrip('_kursiv_')).toBe('*kursiv*');
    expect(roundTrip('Titel\n=====')).toBe('# Titel');
  });

  it('drops formatting markdown cannot express, keeps the text', () => {
    const doc = htmlToDoc('<p><u>unter</u> <span style="color:#ff0000;">rot</span> m<sup>2</sup></p>');
    expect(docToMarkdown(doc)).toBe('unter rot m2');
  });

  it('shows task items and raw HTML in the editor without running it', () => {
    const html = docToHtml(markdownToDoc('- [x] a\n\n<img src=x onerror="alert(1)">'));
    expect(html).toContain('data-checked="true"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('flags markdown the editor cannot show unchanged', () => {
    for (const markdown of Object.values(STORED_FORMS)) expect(editsFaithfully(markdown)).toBe(true);
    expect(editsFaithfully('')).toBe(true);
    // marked strikes a single ~ pair, markdown-it does not
    expect(editsFaithfully('von ~3~ Uhr')).toBe(false);
    expect(editsFaithfully('ca. ~3 bis ~5 km')).toBe(true);
  });
});
