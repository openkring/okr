import { describe, expect, it } from 'vitest';

import { docToHtml, EMPTY_HTML, htmlToDoc } from './rich-text.html';

const roundTrip = (html: string) => docToHtml(htmlToDoc(html));

/**
 * jsdom rewrites a style attribute the serializer writes (`color:#ff0000;` → `color: rgb(255, 0, 0);`);
 * browsers keep the text as written. Pushing both sides through the same rewrite compares meaning, not
 * jsdom's formatting.
 */
function normaliseStyles(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll<HTMLElement>('[style]').forEach((el) => { el.style.cssText = el.getAttribute('style') ?? ''; });
  return container.innerHTML;
}

/**
 * HTML exactly as ngx-editor 18 serialised it. Each must come back byte for byte: the stored texts were
 * written in this form, and any difference is a change the next save would write to Firestore.
 */
const STORED_FORMS: Record<string, string> = {
  paragraph: '<p>Hallo</p>',
  bold: '<p><strong>fett</strong></p>',
  italic: '<p><em>kursiv</em></p>',
  underline: '<p><u>unterstrichen</u></p>',
  strike: '<p><s>durch</s></p>',
  code: '<p><code>x = 1</code></p>',
  sup: '<p>m<sup>2</sup></p>',
  sub: '<p>H<sub>2</sub>O</p>',
  textColor: '<p><span style="color:#ff0000;">rot</span></p>',
  backgroundColor: '<p><span style="background-color:#ffff00;">gelb</span></p>',
  link: '<p><a href="https://example.org" target="_blank">Link</a></p>',
  linkWithTitle: '<p><a href="https://example.org" title="Titel" target="_blank">Link</a></p>',
  headings: '<h1>Eins</h1><h2>Zwei</h2><h3>Drei</h3><h4>Vier</h4><h5>Fünf</h5><h6>Sechs</h6>',
  alignCenter: '<p style="text-align:center">Mitte</p>',
  alignJustify: '<h2 style="text-align:justify">Block</h2>',
  indent: '<p style="margin-left:80px" data-indent="2">eingerückt</p>',
  alignAndIndent: '<p style="text-align:right;margin-left:40px" data-indent="1">beides</p>',
  blockquote: '<blockquote><p>Zitat</p></blockquote>',
  bulletList: '<ul><li><p>a</p></li><li><p>b</p></li></ul>',
  orderedList: '<ol><li><p>eins</p></li><li><p>zwei</p></li></ol>',
  nestedList: '<ul><li><p>a</p><ul><li><p>a1</p></li></ul></li></ul>',
  hardBreak: '<p>eins<br>zwei</p>',
  image: '<p><img src="https://example.org/a.jpg" alt="Bild" width="200"></p>',
  codeBlock: '<pre><code>let a = 1;\nlet b = 2;</code></pre>',
  horizontalRule: '<p>oben</p><hr><p>unten</p>',
  // schema order puts em outside strong, so this is how the old editor stored bold italic
  combined: '<p><em><strong>beides</strong></em></p>',
};

describe('rich-text HTML round trip', () => {
  for (const [name, html] of Object.entries(STORED_FORMS)) {
    it(`keeps ${name} unchanged`, () => {
      expect(normaliseStyles(roundTrip(html))).toBe(normaliseStyles(html));
    });
  }

  it('gives one empty paragraph for empty input', () => {
    expect(docToHtml(htmlToDoc(''))).toBe(EMPTY_HTML);
    expect(docToHtml(htmlToDoc(undefined))).toBe(EMPTY_HTML);
    expect(roundTrip(EMPTY_HTML)).toBe(EMPTY_HTML);
  });

  it('normalises equivalent input to the stored form', () => {
    expect(roundTrip('<p><b>fett</b> <i>kursiv</i></p>')).toBe('<p><strong>fett</strong> <em>kursiv</em></p>');
    expect(roundTrip('Text ohne Absatz')).toBe('<p>Text ohne Absatz</p>');
    expect(roundTrip('<p><strong><em>x</em></strong></p>')).toBe('<p><em><strong>x</strong></em></p>');
  });

  it('drops scripts and event handlers', () => {
    expect(roundTrip('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
    expect(roundTrip('<p><img src="x.png" onerror="alert(1)"></p>')).toBe('<p><img src="x.png"></p>');
  });
});
