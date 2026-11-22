import { describe, expect, it } from 'vitest';

import { htmlTextLength, htmlToVisibleText } from './html-text.util';

describe('htmlToVisibleText', () => {
  it('returns an empty string for empty input', () => {
    expect(htmlToVisibleText(undefined)).toBe('');
    expect(htmlToVisibleText(null)).toBe('');
    expect(htmlToVisibleText('')).toBe('');
    expect(htmlToVisibleText('<p></p>')).toBe('');
  });

  it('removes tags and keeps the text', () => {
    expect(htmlToVisibleText('<p>Hallo <strong>Welt</strong></p>')).toBe('Hallo Welt');
    expect(htmlToVisibleText('<p style="text-align:center"><span style="color:red;">rot</span></p>')).toBe('rot');
  });

  it('turns blocks and <br> into line breaks, without a trailing one', () => {
    expect(htmlToVisibleText('<p>eins</p><p>zwei</p>')).toBe('eins\nzwei');
    expect(htmlToVisibleText('<p>eins<br>zwei</p>')).toBe('eins\nzwei');
    expect(htmlToVisibleText('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('a\n\nb');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToVisibleText('<p>A &amp; B &lt;3 &quot;x&quot;</p>')).toBe('A & B <3 "x"');
    expect(htmlToVisibleText('<p>&#228;&#x00FC;&nbsp;&auml;</p>')).toBe('äü ä');
  });
});

describe('htmlTextLength', () => {
  it('counts what the author sees, not the markup', () => {
    expect(htmlTextLength('<p><strong>Hallo</strong></p>')).toBe(5);
    expect(htmlTextLength('<p>A &amp; B</p>')).toBe(5);
  });

  it('does not throw on a numeric entity outside the Unicode range', () => {
    expect(htmlTextLength('<p>&#99999999;&#x110000;&#0;</p>')).toBe(3);
  });

  it('counts an emoji as one character', () => {
    expect(htmlTextLength('<p>🚣</p>')).toBe(1);
  });

  it('is 0 for an empty editor', () => {
    expect(htmlTextLength('<p></p>')).toBe(0);
  });
});
