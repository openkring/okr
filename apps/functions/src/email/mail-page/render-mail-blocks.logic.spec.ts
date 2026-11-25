import { describe, expect, it } from 'vitest';

import { MAIL_BLOCK_TYPES, type ArticleBlock } from '@okr/shared-models';
import { mailTargetUrl, type MailEventLine } from '@okr/shared-util-core';

import { tintOf } from '../../_shared/brand-color';
import { sanitizeEmailBody } from '../../pdf/sanitize';
import { htmlToText } from '../html-to-text';
import { MAIL_BLOCK_TEMPLATES } from './mail-block-templates';
import { noticeBlocks, renderMailBlocks, type MailBlockContext } from './render-mail-blocks.logic';
import { mailButtonUrl, MailPageError } from './render-mail-page.logic';

const EVENTS: Record<string, MailEventLine[]> = {
  club: [
    { date: '04.12.2026', time: '19:00', title: 'Höck & <Fondue>', place: 'Clubhaus' },
    { date: '12.12.2026', time: '', title: 'Samichlaus', place: '' },
    { date: '20.12.2026', time: '10:00', title: 'Ausfahrt', place: 'Steg' },
  ],
};

async function contextOf(extra: Partial<MailBlockContext> = {}): Promise<MailBlockContext> {
  const { default: hb } = await import('handlebars');
  return { hb, sanitize: sanitizeEmailBody, events: EVENTS, appOrigin: 'https://app.example.ch', color: '#014da2', target: 'mail', ...extra };
}

async function full(blocks: unknown, extra: Partial<MailBlockContext> = {}): Promise<{ html: string; hasContent: boolean }> {
  return renderMailBlocks(blocks, await contextOf(extra));
}

async function render(blocks: unknown, extra: Partial<MailBlockContext> = {}): Promise<string> {
  return (await full(blocks, extra)).html;
}

async function refusal(blocks: unknown): Promise<string> {
  try {
    await full(blocks);
    return 'rendered';
  } catch (e) {
    return e instanceof MailPageError ? `${e.code} ${e.blockId ?? '-'}` : `not a MailPageError: ${String(e)}`;
  }
}

const img = (url: string, extra: Record<string, unknown> = {}) => ({ label: '', type: 0, url, actionUrl: '', altText: '', overlay: '', ...extra });
const text = (id: string, html: string, extra: Record<string, unknown> = {}) => ({ id, type: 'text', html, ...extra });
const image = (id: string, url: string, extra: Record<string, unknown> = {}, imageStyle?: Record<string, unknown>) =>
  ({ id, type: 'image', image: img(url, extra), ...(imageStyle ? { imageStyle } : {}) });
const button = (id: string, url: string, label = 'Anmelden', extra: Record<string, unknown> = {}, style = 'primary') =>
  ({ id, type: 'button', cta: { label, url, style }, ...extra });
const gallery = (id: string, urls: string[], extra: Record<string, unknown> = {}) =>
  ({ id, type: 'gallery', images: urls.map((u) => img(u, { altText: `Alt ${u}` })), ...extra });
const columns = (id: string, sizes: number[], blocks?: unknown[][], extra: Record<string, unknown> = {}) =>
  ({ id, type: 'columns', columns: sizes.map((size, i) => ({ size, blocks: blocks?.[i] ?? [text(`${id}-${i}`, `<p>Spalte${i}</p>`)] })), ...extra });
const callout = (id: string, html: string, tone: unknown = 'primary') => ({ id, type: 'callout', html, tone });
const events = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: 'events', calendarKey: 'club', maxEvents: 5, ...extra });
const divider = (id: string) => ({ id, type: 'divider' });
const space = (id: string, size: unknown = 'medium') => ({ id, type: 'space', size });

const tagsOf = (html: string, name: string): string[] => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
const attrOf = (tag: string, name: string): string => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? '';

/** every block type, as the plain text and the sanitizer tests use it */
const EVERY_BLOCK = [
  text('t', '<h2>Liebe Mitglieder</h2><p>Hallo <a href="https://example.ch/x?a=1&amp;b=2">Link</a></p><ul><li>eins</li><li>zwei</li></ul><p>Bis bald</p>'),
  image('i', 'tenant/x/a.jpg', { altText: 'Boot', overlay: 'Im Hafen', credit: 'Foto: A', actionUrl: '/club' }, { captionPosition: 'bottom' }),
  gallery('g', ['tenant/x/1.jpg', 'tenant/x/2.jpg', 'tenant/x/3.jpg']),
  button('b', '/club', 'Zum Club'),
  columns('c', [6, 6], [[text('c1', '<p>Links</p>')], [image('c2', 'tenant/x/c.jpg', { altText: 'Rechts' }), button('c3', 'mailto:a@b.ch', 'Schreiben', {}, 'secondary')]]),
  callout('k', '<p>Wichtig</p>'),
  divider('d'),
  space('s'),
  events('e', { title: 'Anlässe' }),
];

describe('renderMailBlocks: text', () => {
  it('is a full-width cell with the text style of a mail', async () => {
    const html = await render([text('t', '<p>Hallo</p>')]);
    expect(html).toMatch(/^<table width="100%" cellpadding="0" cellspacing="0" border="0"/);
    const cell = tagsOf(html, 'td')[0];
    expect(attrOf(cell, 'style')).toContain('font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;');
    expect(attrOf(cell, 'style')).toMatch(/;color:#222222;background-color:#ffffff$/);
    expect(attrOf(cell, 'align')).toBe('left');
    expect(html).toContain('Hallo');
  });

  it.each(['left', 'center', 'right'])('aligns %s', async (align) => {
    const cell = tagsOf(await render([text('t', '<p>Hallo</p>', { align })]), 'td')[0];
    expect(attrOf(cell, 'align')).toBe(align);
    expect(attrOf(cell, 'style')).toContain(`text-align:${align};`);
  });

  it('an unknown alignment is left', async () => {
    expect(attrOf(tagsOf(await render([text('t', '<p>x</p>', { align: 'center;background:url(x)' })]), 'td')[0], 'align')).toBe('left');
  });

  it('the first and last paragraph, heading or list have no outer margin', async () => {
    const styles = async (html: string, name: string) => tagsOf(await render([text('t', html)]), name).map((t) => attrOf(t, 'style'));
    expect(await styles('<p>a</p><p>b</p><p>c</p>', 'p')).toEqual(['margin:0 0 16px;margin-top:0', 'margin:0 0 16px', 'margin:0 0 16px;margin-bottom:0']);
    expect(await styles('<h2>a</h2><p>b</p>', 'h2')).toEqual(['margin-top:0']);
    expect(await styles('<h2>a</h2>', 'h2')).toEqual(['margin-bottom:0;margin-top:0']);
    expect(await styles('<p>b</p><ul><li>c<ul><li>d</li></ul></li></ul>', 'ul')).toEqual(['margin-bottom:0', '']);
    expect(await styles('vor <p>b</p> nach', 'p')).toEqual(['margin:0 0 16px']);
  });

  it('only the German text is drawn', async () => {
    const html = await render([text('t', '<p>Deutsch</p>', { htmlI18n: { en: '<p>English</p>' } })]);
    expect(html).toContain('Deutsch');
    expect(html).not.toContain('English');
  });

  it('a text without anything visible renders nothing', async () => {
    expect(await full([text('t', '<p>&nbsp;</p><p></p>')])).toEqual({ html: '', hasContent: false });
  });

  it.each([
    ['/club', 'https://app.example.ch/club'],
    ['https://a.ch/?x=1&amp;y=2', 'https://a.ch/?x=1&amp;y=2'],
    ['http://a.ch/', 'http://a.ch/'],
    ['mailto:a@b.ch', 'mailto:a@b.ch'],
    ['tel:+41440000000', 'tel:+41440000000'],
  ])('a link to %s becomes %s', async (href, expected) => {
    const html = await render([text('t', `<p>vor <a href="${href}" target="_blank">hier</a> nach</p>`)]);
    expect(html).toContain(`<a href="${expected}" target="_blank">hier</a>`);
  });

  it.each(['club.html', '#top', '//evil.org/x', 'javascript:alert(1)', 'data:text/html,x', 'http://a.ch\\@evil.org', 'club'])(
    'a link to %s is unlinked and keeps its text', async (href) => {
      const html = await render([text('t', `<p>vor <a href="${href}"><strong>hier</strong></a> <a href="https://a.ch">da</a> nach</p>`)]);
      expect(html).toContain('vor <strong>hier</strong> <a href="https://a.ch" target="_blank">da</a> nach');
    });

  it('a named anchor loses its tag', async () => {
    expect(await render([text('t', '<p><a name="x">da</a></p>')])).toContain('>da</p>');
  });
});

describe('renderMailBlocks: hostile and pasted texts', () => {
  it('keeps nothing active', async () => {
    const html = await render([
      text('t', '<p onclick="x()" style="width:expression(alert(1));color:red;background:url(https://t.example/x.gif)">a</p><script>1</script><style>p{}</style>'
        + '<iframe src="https://x.ch"></iframe><svg onload="x"></svg><form action="https://x.ch"><input></form><!-- c -->'),
      callout('c', '<p style="behavior:url(#x);-moz-binding:url(x);position:fixed;c\\6flor:blue">b</p><img src="x" onerror="y">'),
    ]);
    expect(html).not.toMatch(/script|onclick|onerror|onload|expression|<style|<iframe|<svg|<form|<input|url\(|behavior|binding|position|<!--/i);
    expect(html).toContain('color:red');
  });

  it('escapes labels, titles, alt texts and captions', async () => {
    const evil = '"><img src=x onerror=alert(1)>';
    const html = await render([
      button('b', 'https://a.ch', evil),
      image('i', 'tenant/x/a.jpg', { altText: evil, overlay: evil }, { captionPosition: 'bottom' }),
      image('j', '', { altText: evil }),
      events('e', { title: evil }),
    ]);
    expect(tagsOf(html, 'img')).toHaveLength(1);
    expect(html.replace(/"[^"]*"/g, '')).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('a colour that is no #rrggbb is the dark grey', async () => {
    const html = await render([button('b', 'https://a.ch'), callout('c', '<p>x</p>')], { color: 'red;x' });
    expect(html).not.toContain('red;x');
    expect(html).toContain('background-color:#222222');
  });

  it('a text pasted from Word is drawn, without its widths and without refusal', async () => {
    const html = await render([text('t',
      '<style>p.MsoNormal{margin:0cm}</style><p class="MsoNormal" style="mso-margin-top-alt:auto;margin-left:-5.4pt;font-family:&quot;Calibri&quot;,sans-serif">Guten Tag<o:p></o:p></p>'
      + '<table class="MsoTableGrid" width="650" border="1" cellspacing="0" style="width:487.5pt;border-collapse:collapse;mso-yfti-tbllook:1184"><tr><td width="325" style="width:243.75pt;padding:0cm 5.4pt">'
      + '<table width="100%"><tr><td>innen</td></tr></table></td></tr></table>')]);
    expect(html).toContain('Guten Tag');
    expect(html).toContain('innen');
    expect(html).toContain('font-family:&quot;Calibri&quot;,sans-serif');
    expect(html).not.toMatch(/mso-margin|mso-yfti|MsoNormal|650|487|-5\.4pt/);
  });

  it('tracking pictures are dropped, pictures fit the mail', async () => {
    const html = await render([text('t', '<p>a<img src="https://t.example/p.gif" width="1" height="1"><img src="https://t.example/q.gif" style="width:0px"><img src="https://a.ch/b.jpg" width="900" height="600" alt="B"></p>')]);
    expect(tagsOf(html, 'img')).toHaveLength(1);
    expect(html).not.toContain('t.example');
    const tag = tagsOf(html, 'img')[0];
    expect(attrOf(tag, 'width')).toBe('440');
    expect(attrOf(tag, 'height')).toBe('');
    expect(attrOf(tag, 'style')).toBe('max-width:100%;height:auto');
  });

  it('a picture whose address the mail policy drops is its alt text', async () => {
    expect(await render([text('t', '<p><img src="http://a.ch/b.jpg" alt="Bild &amp; Ton"></p>')])).toContain('>Bild &amp; Ton</p>');
  });
});

describe('renderMailBlocks: picture', () => {
  const imgTag = async (blocks: unknown[], extra: Partial<MailBlockContext> = {}) => tagsOf(await render(blocks, extra), 'img')[0] ?? '';

  it('full width: attribute 440, imgix at 880', async () => {
    const tag = await imgTag([image('i', 'tenant/x/a.jpg', { altText: 'Boot' })]);
    expect(attrOf(tag, 'src')).toBe('https://bkaiser.imgix.net/tenant/x/a.jpg?auto=compress,format=jpg&amp;w=880&amp;fit=max');
    expect(attrOf(tag, 'width')).toBe('440');
    expect(attrOf(tag, 'alt')).toBe('Boot');
    expect(attrOf(tag, 'style')).toContain('width:100%;max-width:100%;height:auto;');
  });

  it.each([
    ['50%', '220', 'max-width:50%', 'w=440'],
    ['33.5%', '147', 'max-width:33.5%', 'w=294'],
    ['300px', '300', 'max-width:300px', 'w=600'],
    ['300', '300', 'max-width:300px', 'w=600'],
    ['900px', '440', 'max-width:440px', 'w=880'],
    ['auto', '440', 'max-width:100%', 'w=880'],
    ['50vw', '440', 'max-width:100%', 'w=880'],
    ['150%', '440', 'max-width:100%', 'w=880'],
    ['0', '440', 'max-width:100%', 'w=880'],
    ['10px;background:url(x)', '440', 'max-width:100%', 'w=880'],
  ])('width %s', async (width, attr, css, param) => {
    const tag = await imgTag([image('i', 'tenant/x/a.jpg', {}, { width })]);
    expect(attrOf(tag, 'width')).toBe(attr);
    expect(attrOf(tag, 'style')).toContain(`width:100%;${css};`);
    expect(attrOf(tag, 'src')).toMatch(new RegExp(`${param}(&|$)`));
  });

  it('keeps a full https address, adds the width on the imgix host only', async () => {
    expect(attrOf(await imgTag([image('i', 'https://a.ch/b.jpg')]), 'src')).toBe('https://a.ch/b.jpg');
    expect(attrOf(await imgTag([image('i', 'https://bkaiser.imgix.net/tenant/x/a.jpg?sat=-100')]), 'src')).toBe('https://bkaiser.imgix.net/tenant/x/a.jpg?sat=-100&amp;w=880&amp;fit=max');
  });

  it('a blank in the path is encoded', async () => {
    expect(attrOf(await imgTag([image('i', 'tenant/x/a b.jpg')]), 'src')).toContain('/tenant/x/a%20b.jpg?');
  });

  it.each(['', 'http://a.ch/b.jpg', 'data:image/png;base64,x', 'javascript:alert(1)'])('%j gives the alt text', async (url) => {
    const result = await full([image('i', url, { altText: 'Unser Boot' })]);
    expect(result.html).toContain('>Unser Boot</div>');
    expect(result.html).not.toContain('<img');
    expect(result.hasContent).toBe(true);
  });

  it('the label is the alt text when there is none', async () => {
    expect(await render([image('i', '', { label: 'Etikett' })])).toContain('Etikett');
  });

  it('without address and text it is refused', async () => {
    expect(await refusal([image('i', '')])).toBe('invalid-block i');
    expect(await refusal([image('i', 'http://a.ch/b.jpg')])).toBe('invalid-block i');
    expect(await refusal([{ id: 'i', type: 'image' }])).toBe('invalid-block i');
  });

  it('the caption of the reader: overlay and credit, only when a position is set', async () => {
    const texts = { overlay: 'Im Hafen', credit: 'Foto: A' };
    expect(await render([image('i', 'tenant/x/a.jpg', texts)])).not.toContain('Im Hafen');
    for (const captionPosition of ['bottom', 'bottom-overlay', 'middle-overlay']) {
      const html = await render([image('i', 'tenant/x/a.jpg', texts, { captionPosition })]);
      expect(html).toMatch(/<img.*Im Hafen<br \/>Foto: A/);
    }
    expect(await render([image('i', 'tenant/x/a.jpg', texts, { captionPosition: 'top' })])).toMatch(/Im Hafen<br \/>Foto: A.*<img/);
    expect(await render([image('i', 'tenant/x/a.jpg', { credit: 'Foto: A' }, { captionPosition: 'bottom' })])).toContain('Foto: A');
  });

  it('links to what a mail client can open, whatever the stored action', async () => {
    expect(await render([image('i', 'tenant/x/a.jpg', { actionUrl: '/club' }, { action: 2 })])).toMatch(/<a href="https:\/\/app\.example\.ch\/club" target="_blank"[^>]*><img/);
    for (const actionUrl of ['club.html', '#x', 'javascript:x', '//evil.org', 42]) {
      expect(await render([image('i', 'tenant/x/a.jpg', { actionUrl })])).not.toContain('<a ');
    }
  });

  it('malformed texts and styles count as absent', async () => {
    const tag = await imgTag([{ id: 'i', type: 'image', image: { url: 'tenant/x/a.jpg', altText: 7, overlay: {}, credit: null }, imageStyle: { width: 12, captionPosition: 5 } }]);
    expect(attrOf(tag, 'width')).toBe('440');
    expect(attrOf(tag, 'alt')).toBe('');
  });
});

describe('renderMailBlocks: gallery', () => {
  it.each([[1, 1], [2, 1], [3, 2], [5, 3]])('%i pictures stand in %i rows of two', async (count, rows) => {
    const html = await render([gallery('g', Array.from({ length: count }, (_, i) => `tenant/x/${i}.jpg`))]);
    expect(tagsOf(html, 'img')).toHaveLength(count);
    expect(tagsOf(html, 'tr')).toHaveLength(rows);
    expect(tagsOf(html, 'td')).toHaveLength(rows * 2);
    for (const cell of tagsOf(html, 'td')) expect(attrOf(cell, 'width')).toBe('50%');
    expect(html.match(/(?<=imgix\.net\/)tenant\/x\/\d/g)).toEqual(Array.from({ length: count }, (_, i) => `tenant/x/${i}`));
  });

  it('pictures at 212 px, imgix at 424', async () => {
    const tag = tagsOf(await render([gallery('g', ['tenant/x/1.jpg', 'tenant/x/2.jpg'])]), 'img')[0];
    expect(attrOf(tag, 'width')).toBe('212');
    expect(attrOf(tag, 'src')).toContain('w=424');
  });

  it('a layout, a slideshow or a style changes nothing', async () => {
    const urls = ['tenant/x/1.jpg', 'tenant/x/2.jpg', 'tenant/x/3.jpg'];
    const plain = await render([gallery('g', urls)]);
    expect(await render([gallery('g', urls, { layout: 'mosaic', slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 }, imageStyle: { width: '20%', action: 1 } })])).toBe(plain);
  });

  it('a picture has its link and, with a position, its caption', async () => {
    const html = await render([{ id: 'g', type: 'gallery', images: [img('tenant/x/1.jpg', { actionUrl: 'https://a.ch', overlay: 'Titel' })], imageStyle: { captionPosition: 'bottom' } }]);
    expect(html).toMatch(/<a href="https:\/\/a\.ch"[^>]*><img/);
    expect(html).toContain('Titel');
  });

  it('a picture without address is its alt text; an entry without either is left out', async () => {
    const html = await render([{ id: 'g', type: 'gallery', images: [img('', { altText: 'Fehlt' }), img(''), img('tenant/x/1.jpg')] }]);
    expect(html).toContain('Fehlt');
    expect(tagsOf(html, 'td')).toHaveLength(2);
  });

  it('is refused without a picture, with a malformed one, or one that cannot be drawn', async () => {
    expect(await refusal([{ id: 'g', type: 'gallery', images: [] }])).toBe('invalid-block g');
    expect(await refusal([{ id: 'g', type: 'gallery', images: [img('')] }])).toBe('invalid-block g');
    expect(await refusal([{ id: 'g', type: 'gallery', images: [img('tenant/x/1.jpg'), null] }])).toBe('invalid-block g');
    expect(await refusal([{ id: 'g', type: 'gallery', images: [img('tenant/x/1.jpg'), img('http://a.ch/b.jpg')] }])).toBe('invalid-block g');
    expect(await refusal([{ id: 'g', type: 'gallery' }])).toBe('invalid-block g');
  });
});

describe('renderMailBlocks: button', () => {
  it('an app path becomes absolute; the cell has the colour and readable text', async () => {
    const html = await render([button('b', '/club')]);
    expect(html).toContain('href="https://app.example.ch/club"');
    expect(html).toContain('background-color:#014da2');
    expect(tagsOf(html, 'a')[0]).toContain('color:#ffffff');
    expect(await render([button('b', '/club')], { color: '#ffe600' })).toMatch(/<a [^>]*color:#1f2328/);
  });

  it('secondary is an outline on white', async () => {
    const html = await render([button('b', '/club', 'Mehr', {}, 'secondary')]);
    expect(html).toContain('border:2px solid #014da2');
    expect(html).not.toContain('background-color:#014da2');
    expect(tagsOf(html, 'a')[0]).toContain('color:#014da2');
  });

  it('an outline in a light colour keeps dark text', async () => {
    expect(tagsOf(await render([button('b', '/club', 'Mehr', {}, 'secondary')], { color: '#ffe600' }), 'a')[0]).toContain('color:#222222');
  });

  it.each([['left', 'margin:0"'], ['center', 'margin:0 auto"'], ['right', 'margin:0 0 0 auto"']])('aligns %s, without text-align, which would undo it', async (align, margin) => {
    const html = await render([button('b', '/club', 'Mehr', { align })]);
    expect(attrOf(tagsOf(html, 'td')[0], 'align')).toBe(align);
    expect(tagsOf(html, 'table')[1]).toContain(margin);
    expect(html).not.toContain('text-align');
  });

  it.each(['club.html', '#top', 'javascript:alert(1)', '//evil', 'http://a.ch', '', undefined])('a target %j is refused with the id', async (url) => {
    expect(await refusal([button('b7', url as string)])).toBe('invalid-block b7');
  });

  it('without a label, or without cta, it is refused', async () => {
    expect(await refusal([button('b', '/club', '  ')])).toBe('invalid-block b');
    expect(await refusal([{ id: 'b', type: 'button' }])).toBe('invalid-block b');
  });

  it('mailTargetUrl and the rule of the old sections agree', () => {
    const vectors = ['https://a.ch/x', 'mailto:a@b.ch', 'tel:+41', ' /private/events ', '/', '', '#top', '#', 'club.html', 'club.html#a', 'club', '//evil.org', '/\\evil.org', 'http://a.ch',
      'javascript:alert(1)', 'data:x', 'https://a.ch/\u0001', 'HTTPS://a.ch', 'https://', undefined, null, 42];
    for (const v of vectors) expect([v, mailTargetUrl(v, 'https://app.a.ch')]).toEqual([v, mailButtonUrl(v, 'https://app.a.ch')]);
  });
});

describe('renderMailBlocks: columns', () => {
  const columnTables = (html: string) => tagsOf(html, 'table').filter((t) => attrOf(t, 'align') === 'left');

  it.each([
    [[6, 6], ['52%', '48%']],
    [[4, 8], ['35%', '65%']],
    [[8, 4], ['69%', '31%']],
    [[4, 4, 4], ['35%', '35%', '30%']],
    [[3, 6, 3], ['26%', '52%', '22%']],
  ])('%j: one left-aligned table per column, the widths sum to 100', async (sizes, widths) => {
    const html = await render([columns('c', sizes)]);
    const tables = columnTables(html);
    expect(tables.map((t) => attrOf(t, 'width'))).toEqual(widths);
    expect(tables.map((t) => parseInt(attrOf(t, 'width'), 10)).reduce((a, b) => a + b, 0)).toBe(100);
    for (const t of tables) {
      const style = attrOf(t, 'style');
      expect(style).toContain('width:calc((400px - 100%) * 999);');
      expect(style).toMatch(/min-width:\d+(\.\d+)?%;max-width:\d+(\.\d+)?%;/);
      expect(style).toContain('table-layout:fixed;');
    }
    const minimum = tables.map((t) => parseFloat(/min-width:([\d.]+)%/.exec(attrOf(t, 'style'))?.[1] ?? '0')).reduce((a, b) => a + b, 0);
    expect(minimum).toBeLessThanOrEqual(100);
    expect(minimum).toBeGreaterThan(99.9);
  });

  it('keeps the stored order; stackReverse is ignored', async () => {
    const plain = await render([columns('c', [4, 4, 4])]);
    expect(plain.match(/Spalte\d/g)).toEqual(['Spalte0', 'Spalte1', 'Spalte2']);
    expect(await render([columns('c', [4, 4, 4], undefined, { stackReverse: true })])).toBe(plain);
  });

  it('a picture has the width of its column, and enough pixels when it is stacked', async () => {
    const html = await render([columns('c', [6, 6], [[image('a', 'tenant/x/1.jpg')], [image('b', 'tenant/x/2.jpg', {}, { width: '50%' })]])]);
    const [a, b] = tagsOf(html, 'img');
    expect(attrOf(a, 'width')).toBe('212');
    expect(attrOf(a, 'src')).toContain('w=660');
    expect(attrOf(b, 'width')).toBe('106');
    expect(attrOf(b, 'src')).toContain('w=330');
  });

  it('an empty column keeps its place', async () => {
    expect(columnTables(await render([columns('c', [6, 6], [[], [text('b', '<p>x</p>')]])]))).toHaveLength(2);
  });

  it('columns with empty content render nothing', async () => {
    expect(await full([columns('c', [6, 6], [[], [text('b', '<p></p>')]])])).toEqual({ html: '', hasContent: false });
  });

  it('sizes that do not fill 12 are equal ones, as readers draw them', async () => {
    for (const sizes of [[3, 3], [0, 12], ['a', 'b'], [1.5, 10.5]]) {
      expect(columnTables(await render([columns('c', sizes as number[])])).map((t) => attrOf(t, 'width'))).toEqual(['52%', '48%']);
    }
  });

  it('is refused when it is no list of two or three columns', async () => {
    expect(await refusal([columns('c', [12])])).toBe('invalid-block c');
    expect(await refusal([columns('c', [3, 3, 3, 3])])).toBe('invalid-block c');
    expect(await refusal([{ id: 'c', type: 'columns' }])).toBe('invalid-block c');
    expect(await refusal([{ id: 'c', type: 'columns', columns: [{ size: 6, blocks: [] }, null] }])).toBe('invalid-block c');
    expect(await refusal([{ id: 'c', type: 'columns', columns: [{ size: 6, blocks: [] }, { size: 6 }] }])).toBe('invalid-block c');
  });
});

describe('renderMailBlocks: callout, line, space, events', () => {
  const lastCell = async (tone: unknown) => attrOf(tagsOf(await render([callout('k', '<p>Wichtig</p>', tone)]), 'td').at(-1) ?? '', 'style');

  it('a light tint with dark text; secondary and tertiary are the brand too', async () => {
    const primary = await lastCell('primary');
    expect(primary).toContain(`background-color:${tintOf('#014da2', 0.12)}`);
    expect(primary).toContain('color:#222222');
    expect(await lastCell('secondary')).toBe(primary);
    expect(await lastCell('tertiary')).toBe(primary);
  });

  it('neutral, and any other tone, is a light grey', async () => {
    expect(await lastCell('neutral')).toContain('background-color:#f1f1f1');
    expect(await lastCell('loud')).toBe(await lastCell('neutral'));
  });

  it.each(['#000000', '#ff0000', '#ffff00', '#014da2'])('the text stays readable on the tint of %s', async (color) => {
    const bg = /background-color:(#[0-9a-f]{6})/.exec(attrOf(tagsOf(await render([callout('k', '<p>x</p>')], { color }), 'td').at(-1) ?? '', 'style'))?.[1] ?? '';
    for (const i of [1, 3, 5]) expect(parseInt(bg.slice(i, i + 2), 16)).toBeGreaterThanOrEqual(0xdd);
  });

  it('the last paragraph of a callout has no margin', async () => {
    expect(tagsOf(await render([callout('k', '<p>a</p>')]), 'p')[0]).toContain('margin:0 0 16px;margin-bottom:0;margin-top:0"');
  });

  it('an empty callout renders nothing', async () => {
    expect(await full([callout('k', '<p></p>')])).toEqual({ html: '', hasContent: false });
  });

  it('a line is a cell with a border', async () => {
    expect(attrOf(tagsOf(await render([divider('d')]), 'td')[0], 'style')).toContain('border-top:1px solid #cccccc');
  });

  it.each([['small', '8'], ['medium', '24'], ['large', '48'], ['huge', '24']])('a %s space is a cell of %s px', async (size, px) => {
    const cell = tagsOf(await render([space('s', size)]), 'td')[0];
    expect(attrOf(cell, 'height')).toBe(px);
    expect(attrOf(cell, 'style')).toContain(`height:${px}px;line-height:${px}px;`);
  });

  it('events: date, time, title and place of its calendar, escaped, at most maxEvents', async () => {
    const html = await render([events('e', { title: 'Anlässe', maxEvents: 2 })]);
    expect(html).toContain('>Anlässe</h2>');
    expect(html).toContain('04.12.2026<br />19:00');
    expect(html).toContain('<strong>Höck &amp; &lt;Fondue&gt;</strong><br />');
    expect(html).toContain('Clubhaus');
    expect(html).toContain('Samichlaus');
    expect(html).not.toContain('Ausfahrt');
  });

  it('events: at most ten; without a title no heading', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ date: `${i}`, time: '', title: `Anlass-${i}-x`, place: '' }));
    const html = await render([events('e', { maxEvents: 50 })], { events: { club: many } });
    expect(html.match(/Anlass-/g)).toHaveLength(10);
    expect(html).not.toContain('<h2');
  });

  it('events without upcoming ones render nothing', async () => {
    expect(await render([events('e', { calendarKey: 'other', title: 'Anlässe' })])).toBe('');
    expect(await render([events('e', { calendarKey: 'constructor' })])).toBe('');
  });

  it('events without a calendar are refused', async () => {
    expect(await refusal([events('e', { calendarKey: '' })])).toBe('invalid-block e');
    expect(await refusal([events('e', { calendarKey: undefined })])).toBe('invalid-block e');
  });
});

describe('renderMailBlocks: structure', () => {
  it('has a template for every block type', () => {
    expect(Object.keys(MAIL_BLOCK_TEMPLATES).sort()).toEqual([...MAIL_BLOCK_TYPES].sort());
  });

  it('keeps the order of the blocks', async () => {
    expect((await render([text('b', '<p>Bravo</p>'), divider('d'), text('a', '<p>Alpha</p>')])).match(/Bravo|Alpha|border-top/g)).toEqual(['Bravo', 'border-top', 'Alpha']);
  });

  it.each([
    ['an unknown type', [text('a', '<p>x</p>'), { id: 'v', type: 'video' }], 'unknown-block-type v'],
    ['a type of the object prototype', [{ id: 'v', type: 'constructor' }], 'unknown-block-type v'],
    ['an unknown type in a column', [columns('c', [6, 6], [[{ id: 'v', type: 'video' }], []])], 'unknown-block-type v'],
    ['columns in columns', [columns('c', [6, 6], [[columns('n', [6, 6])], []])], 'invalid-block n'],
    ['a callout in a column', [columns('c', [6, 6], [[callout('k', '<p>x</p>')], []])], 'invalid-block k'],
    ['a gallery in a column', [columns('c', [6, 6], [[gallery('g', ['a.jpg'])], []])], 'invalid-block g'],
    ['events in a column', [columns('c', [6, 6], [[events('e')], []])], 'invalid-block e'],
    ['a button without target in a column', [columns('c', [6, 6], [[button('b', '#x')], []])], 'invalid-block b'],
    ['null', [null], 'invalid-block -'],
    ['a text for a block', ['x'], 'invalid-block -'],
    ['a list for a block', [[]], 'invalid-block -'],
    ['no id', [{ type: 'text', html: '<p>x</p>' }], 'invalid-block -'],
    ['an empty id', [text('', '<p>x</p>')], 'invalid-block -'],
    ['no type', [{ id: 'a', html: '<p>x</p>' }], 'invalid-block a'],
    ['null in a column', [columns('c', [6, 6], [[null], []])], 'invalid-block -'],
    ['a text without html', [{ id: 't', type: 'text' }], 'invalid-block t'],
    ['a callout whose html is no text', [callout('k', 7 as unknown as string)], 'invalid-block k'],
    ['51 blocks', Array.from({ length: 51 }, (_, i) => divider(`d${i}`)), 'invalid-block -'],
    ['no list', { 0: text('a', '<p>x</p>') }, 'invalid-block -'],
    ['undefined', undefined, 'invalid-block -'],
  ])('refuses %s', async (_name, blocks, expected) => {
    expect(await refusal(blocks)).toBe(expected);
  });

  it('50 blocks are fine', async () => {
    expect((await full(Array.from({ length: 50 }, (_, i) => text(`t${i}`, '<p>x</p>')))).hasContent).toBe(true);
  });

  it.each([
    ['nothing', [], false],
    ['events alone', [events('e')], false],
    ['a line and a space', [divider('d'), space('s')], false],
    ['columns with a line of blanks', [columns('c', [6, 6], [[text('a', '<p> </p>')], []])], false],
    ['a text', [text('t', '<p>x</p>')], true],
    ['a picture', [image('i', 'tenant/x/a.jpg')], true],
    ['a gallery', [gallery('g', ['tenant/x/a.jpg'])], true],
    ['a button', [button('b', '/club')], true],
    ['a callout', [callout('k', '<p>x</p>')], true],
    ['columns with a button', [columns('c', [6, 6], [[button('b', '/club')], []])], true],
    ['events and a text', [events('e'), text('t', '<p>x</p>')], true],
  ])('%s: content %s', async (_name, blocks, expected) => {
    expect((await full(blocks)).hasContent).toBe(expected);
  });

  it('every cell of a mail sets its text and background colour', async () => {
    const cells = tagsOf(await render(EVERY_BLOCK), 'td');
    expect(cells.length).toBeGreaterThan(15);
    for (const cell of cells) {
      expect(cell).toMatch(/[";]color:#[0-9a-f]{6}/);
      expect(cell).toMatch(/background-color:#[0-9a-f]{6}/);
    }
  });

  it('emits no flex, grid, style block, class or media query', async () => {
    expect(await render(EVERY_BLOCK)).not.toMatch(/display:\s*(flex|grid)|<style|class=|@media/);
  });

  it('a second sanitizer pass changes nothing but the paragraph margin', async () => {
    for (const target of ['mail', 'print'] as const) {
      const html = await render([...EVERY_BLOCK, text('w', '<p style="margin:0;color:red">x</p><p>y</p>')], { target });
      const again = await sanitizeEmailBody(html);
      expect(html).not.toMatch(/(margin:0 0 16px;)+margin:0 0 16px/);
      expect(again.replace(/(margin:0 0 16px;)+(?=margin:0 0 16px)/g, '')).toBe(html);
    }
  });

  it('reads line by line as plain text', async () => {
    expect(htmlToText(await render(EVERY_BLOCK))).toBe([
      'Liebe Mitglieder', '',
      'Hallo Link (https://example.ch/x?a=1&b=2)', '',
      '- eins', '- zwei', '',
      'Bis bald', '',
      'https://app.example.ch/club', '',
      'Im Hafen', 'Foto: A', '',
      'Alt tenant/x/1.jpg', '',
      'Alt tenant/x/2.jpg', '',
      'Alt tenant/x/3.jpg', '',
      'Zum Club (https://app.example.ch/club)', '',
      'Links', '',
      'Rechts', '',
      'Schreiben (mailto:a@b.ch)', '',
      'Wichtig', '',
      'Anlässe', '',
      '04.12.2026', '19:00 Höck & <Fondue>', 'Clubhaus',
      '12.12.2026 Samichlaus',
      '20.12.2026', '10:00 Ausfahrt', 'Steg',
    ].join('\n'));
  });
});

describe('renderMailBlocks: print', () => {
  const print = (blocks: unknown) => render(blocks, { target: 'print' });

  it('a button is its label and address, without background', async () => {
    const html = await print([button('b', '/club', 'Zum Club')]);
    expect(html).toContain('<strong>Zum Club</strong><br />https://app.example.ch/club');
    expect(html).not.toMatch(/<a |background|border:/);
  });

  it('mail and phone addresses are printed without their scheme', async () => {
    expect(await print([button('b', 'mailto:a@b.ch?subject=x', 'Schreiben')])).toContain('<br />a@b.ch</td>');
    expect(await print([button('b', 'tel:+41440000000', 'Anrufen')])).toContain('<br />+41440000000</td>');
  });

  it('pictures are at most 80 mm high and not distorted', async () => {
    for (const tag of tagsOf(await print([image('i', 'tenant/x/a.jpg', {}, { width: '50%' }), gallery('g', ['tenant/x/1.jpg', 'tenant/x/2.jpg'])]), 'img')) {
      expect(attrOf(tag, 'style')).toContain('width:auto;');
      expect(attrOf(tag, 'style')).toContain('max-height:80mm;');
    }
  });

  it('a picture in a text is at most 80 mm high, too', async () => {
    expect(await print([text('t', '<p><img src="https://a.ch/b.jpg" alt="B"></p>')])).toContain('style="width:auto;max-height:80mm;max-width:100%;height:auto"');
  });

  it('a gallery is a grid of two', async () => {
    const html = await print([gallery('g', ['tenant/x/1.jpg', 'tenant/x/2.jpg', 'tenant/x/3.jpg'])]);
    expect(tagsOf(html, 'tr')).toHaveLength(2);
    expect(tagsOf(html, 'td')).toHaveLength(4);
  });

  it('a callout has a thin border, nothing has a background', async () => {
    const html = await print(EVERY_BLOCK);
    expect(html).not.toContain('background');
    expect(await print([callout('k', '<p>x</p>')])).toContain('border:1px solid #999999');
  });

  it('columns are cells of one row', async () => {
    const html = await print([columns('c', [4, 8])]);
    expect(html).not.toMatch(/calc|align="left" style="width/);
    expect(html).toContain('Spalte1');
  });
});

describe('noticeBlocks', () => {
  const notice = (blocks: unknown) => noticeBlocks(blocks, { sanitize: sanitizeEmailBody, events: EVENTS });

  it('events become a text with their lines, under the same id', async () => {
    const [block] = await notice([events('e', { title: 'Anlässe <x>', maxEvents: 2 })]) as { id: string; type: string; html: string }[];
    expect(block).toMatchObject({ id: 'e', type: 'text' });
    expect(htmlToText(block.html)).toBe(['Anlässe <x>', '', '04.12.2026 19:00 Höck & <Fondue>', 'Clubhaus', '', '12.12.2026 Samichlaus'].join('\n'));
  });

  it('events without upcoming ones are left out', async () => {
    expect(await notice([events('e', { calendarKey: 'other' })])).toEqual([]);
  });

  it('keeps ids, order and the path of a button; nothing of type events is left', async () => {
    const blocks = await notice(EVERY_BLOCK);
    expect(blocks.map((b) => b.id)).toEqual(['t', 'i', 'g', 'b', 'c', 'k', 'd', 's', 'e']);
    expect(blocks.map((b) => b.type)).not.toContain('events');
    expect(blocks[3]).toEqual({ id: 'b', type: 'button', cta: { label: 'Zum Club', url: '/club', style: 'primary' } });
    expect(await notice(EVERY_BLOCK)).toEqual(blocks);
  });

  it('sanitizes every html, also in columns, and drops translations', async () => {
    const evil = '<p onclick="x">a</p><script>1</script>';
    const blocks = await notice([
      text('t', evil, { htmlI18n: { en: evil }, align: 'center' }), callout('k', evil, 'tertiary'), columns('c', [4, 8], [[text('c1', evil)], []], { stackReverse: true }),
    ]);
    expect(JSON.stringify(blocks)).not.toMatch(/onclick|script|I18n|stackReverse/);
    expect(blocks[0]).toEqual({ id: 't', type: 'text', html: '<p style="margin:0 0 16px">a</p>', align: 'center' });
    expect(blocks[1]).toMatchObject({ type: 'callout', tone: 'tertiary' });
    expect(blocks[2]).toEqual({ id: 'c', type: 'columns', columns: [{ size: 4, blocks: [{ id: 'c1', type: 'text', html: '<p style="margin:0 0 16px">a</p>' }] }, { size: 8, blocks: [] }] });
  });

  it('a picture keeps its texts and style; an unsafe link is emptied', async () => {
    const [a, b] = await notice([
      image('i', 'tenant/x/a.jpg', { altText: 'Alt', actionUrl: '/club', extra: 'x' }, { width: '50%', action: 4 }), image('j', 'tenant/x/a.jpg', { actionUrl: 'javascript:x' }),
    ]) as Extract<ArticleBlock, { type: 'image' }>[];
    expect(a.image).toMatchObject({ url: 'tenant/x/a.jpg', altText: 'Alt', actionUrl: '/club' });
    expect(a.image).not.toHaveProperty('extra');
    expect(a.imageStyle).toEqual({ width: '50%', action: 4 });
    expect(b.image.actionUrl).toBe('');
    expect(b).not.toHaveProperty('imageStyle');
  });

  it('a gallery keeps its pictures, layout and slideshow', async () => {
    const [g] = await notice([gallery('g', ['tenant/x/1.jpg'], { layout: 'pair' })]);
    expect(g).toMatchObject({ id: 'g', type: 'gallery', layout: 'pair', images: [{ url: 'tenant/x/1.jpg' }] });
  });

  it('holds no undefined value and shares no object with the input', async () => {
    const input = structuredClone(EVERY_BLOCK);
    const blocks = await notice(input);
    expect(input).toEqual(EVERY_BLOCK);
    const walk = (v: unknown): void => {
      expect(v).not.toBeUndefined();
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    blocks.forEach(walk);
    const styles = [image('i', 'tenant/x/a.jpg', {}, { width: '50%' })];
    const [block] = await notice(styles) as Extract<ArticleBlock, { type: 'image' }>[];
    expect(block.imageStyle).not.toBe(styles[0].imageStyle);
  });

  it('refuses what renderMailBlocks refuses', async () => {
    for (const bad of [[{ id: 'v', type: 'video' }], [button('b', '#x')], [null], [image('i', '')], [columns('c', [6, 6], [[callout('k', '<p>x</p>')], []])]]) {
      await expect(notice(bad)).rejects.toThrow(MailPageError);
    }
  });
});
