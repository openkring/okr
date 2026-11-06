import { describe, expect, it } from 'vitest';

import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('converts links, lists and entities', () => {
    expect(htmlToText('<p>A &amp; B</p><ul><li>x</li></ul><a href="https://a.ch">hier</a>')).toBe('A & B\n\n- x\n\nhier (https://a.ch)');
  });

  it('uses alt text for an image-only body', () => {
    expect(htmlToText('<p><img src="https://a.ch/a.png" alt="Foto"></p>')).toBe('Foto');
    expect(htmlToText('<p><img src="https://a.ch/a.png"></p>')).toBe('');
  });

  it('shows a link once when its text is the address', () => {
    expect(htmlToText('<a href="https://a.ch">https://a.ch</a>')).toBe('https://a.ch');
  });

  it('drops style and script blocks and turns br into line breaks', () => {
    expect(htmlToText('<style>p{color:red}</style><script>x()</script>a<br>b')).toBe('a\nb');
  });

  it('decodes &amp; last so an escaped entity stays literal', () => {
    expect(htmlToText('<p>&amp;lt; &lt; &#x3D; &nbsp;x</p>')).toBe('&lt; < =  x');
  });

  it('leaves an entity above U+10FFFF as written instead of throwing', () => {
    expect(htmlToText('<p>a &#x110000; b &#1114112; c &#99999999999999999999; d &#x1F600;</p>')).toBe(
      'a &#x110000; b &#1114112; c &#99999999999999999999; d \u{1F600}'
    );
  });
});
