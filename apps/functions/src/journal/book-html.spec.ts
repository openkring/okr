import { describe, expect, it } from 'vitest';

import { htmlToRuns, runsToHtml } from './book-html';

describe('book html', () => {
  it('htmlToRuns keeps paragraphs, bold, italic, lists and headings', () => {
    const runs = htmlToRuns('<h2>Kap Hoorn</h2><p>Wir  sind <strong>endlich</strong> <em>da</em>.<br>Zweite Zeile</p>'
      + '<ul><li><p>eins</p></li><li>zwei</li></ul><ol start="3"><li>drei</li></ol><p></p><p class="book-author">Bruno Kaiser</p>');
    expect(runs).toEqual([
      { text: 'Kap Hoorn', heading: true, paragraphEnd: true },
      { text: 'Wir sind ' },
      { text: 'endlich', bold: true },
      { text: ' ' },
      { text: 'da', italic: true },
      { text: '.\nZweite Zeile', paragraphEnd: true },
      { text: 'eins', list: true, bullet: '•', paragraphEnd: true },
      { text: 'zwei', list: true, bullet: '•', paragraphEnd: true },
      { text: 'drei', list: true, bullet: '3.', paragraphEnd: true },
      { text: '', paragraphEnd: true },
      { text: 'Bruno Kaiser', cls: 'author', paragraphEnd: true },
    ]);
  });

  it('htmlToRuns keeps ♥ and leaves emoji stripping to the util (ruling R5)', () => {
    // the util strips every user string before it composes a frame; «♥» is its own like line
    expect(htmlToRuns('<p class="book-likes">♥ 12</p>')).toEqual([{ text: '♥ 12', cls: 'likes', paragraphEnd: true }]);
  });

  it('htmlToRuns decodes entities, keeps the util classes and drops unknown tags', () => {
    expect(htmlToRuns('<p><span class="book-number">3</span> Ushuaia &amp; <a href="x">Beagle</a>&nbsp;Kanal &#8211; ok</p><script>x</script>'))
      .toEqual([
        { text: '3', cls: 'number' },
        { text: ' Ushuaia & Beagle Kanal – ok', paragraphEnd: true },
      ]);
    expect(htmlToRuns('<p class="book-heading">Statistik</p>')).toEqual([{ text: 'Statistik', heading: true, paragraphEnd: true }]);
  });

  it('runsToHtml reads back to the same runs, continued list items included', () => {
    const html = '<h3>Titel</h3><p>a <b>b</b> <i>c</i><br>d</p><ul><li>eins</li></ul><p class="book-likes">♥ 2</p>'
      + '<p><span class="book-number">7</span> Kap</p><p class="book-author">Ann</p>';
    const runs = htmlToRuns(html);
    expect(htmlToRuns(runsToHtml(runs))).toEqual(runs);
    const cont = [{ text: 'weiter', list: true, bullet: '', paragraphEnd: true }];
    expect(htmlToRuns(runsToHtml(cont))).toEqual(cont);
  });
});
