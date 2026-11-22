import { describe, expect, it } from 'vitest';

import { MAIL_SECTION_TYPES } from '@okr/shared-models';

import { sanitizeEmailBody } from '../../pdf/sanitize';
import { MAIL_SECTION_TEMPLATES } from './mail-section-templates';
import { MAX_MAIL_EVENTS, mailEventLimit, MailEventLine, MailPageError, MailSection, renderMailPageContent } from './render-mail-page.logic';

async function render(order: string[], sections: MailSection[], events: Record<string, MailEventLine[]> = {}): Promise<string> {
  const { default: hb } = await import('handlebars');
  return renderMailPageContent(order, sections, { hb, sanitize: sanitizeEmailBody, events });
}

function article(okey: string, htmlContent: string, extra: Partial<MailSection> = {}): MailSection {
  return { okey, type: 'article', content: { htmlContent }, properties: { images: [] }, ...extra };
}

function button(okey: string, url: string, label = 'Anmelden'): MailSection {
  return { okey, type: 'button', properties: { style: { label }, action: { url } } };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof MailPageError ? e.code : `not a MailPageError: ${String(e)}`;
  }
}

describe('renderMailPageContent', () => {
  it('renders sections in page order, not array order', async () => {
    const html = await render(['b', 'a'], [article('a', '<p>Alpha</p>'), article('b', '<p>Bravo</p>')]);
    expect(html.indexOf('Bravo')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('Alpha')).toBeGreaterThan(html.indexOf('Bravo'));
  });

  it('refuses an unknown section type', async () => {
    expect(await codeOf(render(['m'], [{ okey: 'm', type: 'map' }]))).toBe('unknown-section-type');
  });

  it('refuses a page with no content', async () => {
    expect(await codeOf(render(['a'], [article('a', '<p></p>')]))).toBe('no-content');
  });

  it('strips script, style and event handlers from article html', async () => {
    const html = await render(['a'], [article('a', '<p onclick="x">a</p><script>1</script><style>p{}</style>')]);
    expect(html).toMatch(/<p style="[^"]*">a<\/p>/);
    expect(html).not.toMatch(/script/i);
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/<style/i);
  });

  it('drops a javascript: button url', async () => {
    const html = await render(['a', 'b'], [article('a', '<p>Text</p>'), button('b', 'javascript:alert(1)')]);
    expect(html).not.toMatch(/href="javascript/i);
    expect(html).not.toContain('Anmelden');
  });

  it('renders a button with a safe url', async () => {
    const html = await render(['b'], [button('b', 'https://example.org/x?a=1&b=2', 'Jetzt <anmelden>')]);
    expect(html).toContain('href="https://example.org/x?a=1&amp;b=2"');
    expect(html).toContain('Jetzt &lt;anmelden&gt;');
  });

  it('escapes the title', async () => {
    const html = await render(['a'], [article('a', '<p>Text</p>', { title: '<b>x</b>' })]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('uses absolute imgix urls at 600 px for article images', async () => {
    const html = await render(['a'], [
      article('a', '<p>Text</p>', { properties: { images: [{ url: 'tenant/scs/img/boot.jpg', altText: 'Boot' }] } }),
    ]);
    expect(html).toMatch(/<img [^>]*src="https:\/\/bkaiser\.imgix\.net\/tenant\/scs\/img\/boot\.jpg\?[^"]*w=600/);
    expect(html).toContain('width="600"');
    expect(html).toContain('alt="Boot"');
  });

  it('renders the alt text of an image without a path', async () => {
    const html = await render(['a'], [article('a', '', { properties: { images: [{ url: '', altText: 'Unser Boot' }] } })]);
    expect(html).toContain('Unser Boot');
    expect(html).not.toContain('<img');
  });

  it('renders the events lines', async () => {
    const line: MailEventLine = { date: '24.12.2026', time: '18:00', title: 'Weihnachtsrudern', place: 'Bootshaus' };
    const html = await render(['e'], [{ okey: 'e', type: 'events', name: 'club', title: 'Termine' }], { club: [line] });
    expect(html).toContain('Weihnachtsrudern');
    expect(html).toContain('24.12.2026');
    expect(html).toContain('Bootshaus');
  });

  it('treats an events section without lines as no content', async () => {
    expect(await codeOf(render(['e'], [{ okey: 'e', type: 'events', name: 'club' }], { club: [] }))).toBe('no-content');
  });

  it('has a template for every mail section type', () => {
    expect(Object.keys(MAIL_SECTION_TEMPLATES).sort()).toEqual([...MAIL_SECTION_TYPES].sort());
  });

  it('emits no flex, grid or style block', async () => {
    const html = await render(['a', 'b', 'e'], [
      article('a', '<p>y</p>', { title: 'T', properties: { images: [{ url: 'a.jpg', altText: '' }] } }),
      button('b', 'https://example.org'),
      { okey: 'e', type: 'events', name: 'club' },
    ], { club: [{ date: '1.1.2027', time: '', title: 'E', place: '' }] });
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).not.toMatch(/<style/);
  });

  it('survives a second sanitizeEmailBody pass', async () => {
    const html = await render(['a', 'b', 'e'], [
      article('a', '<p>Hallo <a href="https://example.org/?a=1&b=2">Link</a></p>', {
        title: 'Titel', subTitle: 'Unter', properties: { images: [{ url: 'a/b.png', altText: 'Bild' }] },
      }),
      button('b', 'mailto:info@example.org'),
      { okey: 'e', type: 'events', name: 'club', title: 'Termine' },
    ], { club: [{ date: '1.1.2027', time: '10:00', title: 'E & F', place: 'Ort' }] });
    const again = await sanitizeEmailBody(html);
    const normalise = (s: string) => s.replace(/(margin:0 0 16px;?)+/g, '');
    expect(normalise(again)).toBe(normalise(html));
    expect(again.match(/<table/g)?.length).toBe(html.match(/<table/g)?.length);
    expect(again).toContain('href="mailto:info@example.org"');
    expect(again).toContain('cellpadding="0"');
  });
});

describe('mailEventLimit', () => {
  it('takes the section\'s maxEvents', () => expect(mailEventLimit({ maxEvents: 3 })).toBe(3));
  it('rounds a fraction down', () => expect(mailEventLimit({ maxEvents: 3.7 })).toBe(3));
  it('caps at MAX_MAIL_EVENTS', () => expect(mailEventLimit({ maxEvents: 50 })).toBe(MAX_MAIL_EVENTS));
  it('falls back to the model default (5) without a usable value', () => {
    expect(mailEventLimit(undefined)).toBe(5);
    expect(mailEventLimit({})).toBe(5);
    expect(mailEventLimit({ maxEvents: 0 })).toBe(5);
    expect(mailEventLimit({ maxEvents: -2 })).toBe(5);
    expect(mailEventLimit({ maxEvents: '7' })).toBe(5);
    expect(mailEventLimit({ maxEvents: Number.NaN })).toBe(5);
  });
});

describe('renderMailPageContent with maxEvents', () => {
  const lines: MailEventLine[] = Array.from({ length: 10 }, (_, i) => ({ date: `0${i}.01.2027`, time: '', title: `Termin-${i}-x`, place: '' }));

  it('lists only the section\'s maxEvents of its calendar\'s lines', async () => {
    const html = await render(['e'], [{ okey: 'e', type: 'events', name: 'club', properties: { maxEvents: 2 } }], { club: lines });
    expect(html).toContain('Termin-0-x');
    expect(html).toContain('Termin-1-x');
    expect(html).not.toContain('Termin-2-x');
  });

  it('gives two sections of the same calendar their own limits', async () => {
    const html = await render(['a', 'b'], [
      { okey: 'a', type: 'events', name: 'club', properties: { maxEvents: 1 } },
      { okey: 'b', type: 'events', name: 'club', properties: { maxEvents: 3 } },
    ], { club: lines });
    expect(html.match(/Termin-0-x/g)?.length).toBe(2);
    expect(html.match(/Termin-2-x/g)?.length).toBe(1);
    expect(html).not.toContain('Termin-3-x');
  });
});
