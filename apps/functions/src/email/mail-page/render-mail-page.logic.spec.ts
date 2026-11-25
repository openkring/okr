import { describe, expect, it } from 'vitest';

import { MAIL_SECTION_TYPES } from '@okr/shared-models';
import type { MailEventLine } from '@okr/shared-util-core';

import { sanitizeEmailBody } from '../../pdf/sanitize';
import { renderMailContent } from './mail-content';
import { MAIL_SECTION_TEMPLATES } from './mail-section-templates';
import { mailButtonUrl, MailPageError, MailSection, renderMailPageContent } from './render-mail-page.logic';

async function render(order: string[], sections: MailSection[], events: Record<string, MailEventLine[]> = {}): Promise<string> {
  const { default: hb } = await import('handlebars');
  const ctx = { hb, sanitize: sanitizeEmailBody, events, appOrigin: 'https://app.example.org' };
  const html = await renderMailPageContent(order, sections, ctx);
  // what is sent of a page without blocks is this string and nothing else
  expect(await renderMailContent(order, sections, { ...ctx, color: '#014da2' })).toStrictEqual({ html });
  return html;
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

describe('mailButtonUrl', () => {
  it('keeps https, mailto and tel', () => {
    expect(mailButtonUrl('https://a.ch/x', 'https://app.a.ch')).toBe('https://a.ch/x');
    expect(mailButtonUrl('mailto:a@b.ch', 'https://app.a.ch')).toBe('mailto:a@b.ch');
    expect(mailButtonUrl('tel:+41', 'https://app.a.ch')).toBe('tel:+41');
  });
  it('makes an app path absolute', () => expect(mailButtonUrl(' /private/events ', 'https://app.a.ch')).toBe('https://app.a.ch/private/events'));
  it('drops what a mail client cannot open', () => {
    for (const u of ['', '#top', 'club.html', '//evil.org', '/\\evil.org', 'http://a.ch', 'javascript:alert(1)', undefined]) {
      expect(mailButtonUrl(u, 'https://app.a.ch')).toBe('');
    }
  });
});

describe('renderMailPageContent: intro and button of an article', () => {
  const withCta = (cta: unknown, html = '<p>Text</p>') => article('a', html, { properties: { images: [], cta } });

  it('shows the intro below the title by default, with its line breaks', async () => {
    const html = await render(['a'], [article('a', '<p>Text</p>', { title: 'Titel', intro: 'Eins\nZwei' })]);
    expect(html).toMatch(/Eins<br \/>\s*Zwei/);
    expect(html.indexOf('Eins')).toBeGreaterThan(html.indexOf('Titel'));
    expect(html.indexOf('Eins')).toBeLessThan(html.indexOf('Text'));
    expect(html.match(/Eins/g)?.length).toBe(1);
  });
  it('shows the intro above the title when set so', async () => {
    const html = await render(['a'], [article('a', '<p>Text</p>', { title: 'Titel', intro: 'Vorab', introPosition: 'above' })]);
    expect(html.indexOf('Vorab')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('Vorab')).toBeLessThan(html.indexOf('Titel'));
  });
  it('escapes the intro', async () => {
    const html = await render(['a'], [article('a', '', { intro: '<b>x</b>' })]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('counts an intro alone as content', async () => {
    expect(await render(['a'], [article('a', '', { intro: 'Nur das' })])).toContain('Nur das');
  });
  it('renders the button below the text', async () => {
    const html = await render(['a'], [withCta({ label: 'Jetzt <los>', url: 'https://example.org/x?a=1&b=2', style: 'primary' })]);
    expect(html).toContain('href="https://example.org/x?a=1&amp;b=2"');
    expect(html).toContain('Jetzt &lt;los&gt;');
    expect(html.indexOf('Jetzt')).toBeGreaterThan(html.indexOf('Text'));
    expect(html).toContain('background-color:#222222');
  });
  it('draws a secondary button as an outline', async () => {
    const html = await render(['a'], [withCta({ label: 'Mehr', url: 'https://example.org', style: 'secondary' })]);
    expect(html).toContain('border:1px solid #222222');
    expect(html).not.toContain('background-color:#222222');
  });
  it('resolves an app path', async () => {
    expect(await render(['a'], [withCta({ label: 'Mehr', url: '/club', style: 'primary' })])).toContain('href="https://app.example.org/club"');
    expect(await render(['b'], [button('b', '/club')])).toContain('href="https://app.example.org/club"');
  });
  it('leaves out a button without label or with an unusable url', async () => {
    expect(await render(['a'], [withCta({ label: '', url: 'https://example.org', style: 'primary' })])).not.toContain('<a ');
    expect(await render(['a'], [withCta({ label: 'X', url: 'javascript:alert(1)', style: 'primary' })])).not.toContain('<a ');
    expect(await codeOf(render(['a'], [withCta({ label: 'X', url: '#top', style: 'primary' }, '')]))).toBe('no-content');
  });
  it('survives a second sanitize pass', async () => {
    const html = await render(['a'], [article('a', '', { intro: 'Vorab', introPosition: 'above', properties: { images: [], cta: { label: 'Mehr', url: '/club', style: 'secondary' } } })]);
    expect(await sanitizeEmailBody(html)).toBe(html);
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

describe('the bytes of a page without blocks (recorded before 1.176)', () => {
  it('an article with everything, an outline button, a button section and events', async () => {
    const html = await render(['e', 'a', 'b', 'x', 'c'], [
      article('a', '<h1>Hallo</h1><p onclick="x" style="color:#ff0000">Liebe <a href="/club">Mitglieder</a> &amp; Freunde</p><p>Zwei</p>', {
        title: 'Titel & <mehr>', subTitle: 'Unter', intro: 'Eins\nZwei', introPosition: 'above',
        properties: { images: [{ url: 'tenant/scs/img/boot.jpg', altText: 'Boot' }], cta: { label: 'Mehr', url: '/club', style: 'secondary' } },
      }),
      button('b', 'https://example.org/x?a=1&b=2', 'Jetzt <anmelden>'),
      article('x', '<p>archiviert</p>', { isArchived: true }),
      article('c', '', { intro: 'Nur das', properties: { images: [{ url: '', altText: 'Unser Boot' }], cta: { label: 'Los', url: 'mailto:a@b.ch' } } }),
      { okey: 'e', type: 'events', name: 'club', title: 'Termine', properties: { maxEvents: 2 } },
    ], { club: [
      { date: '04.12.2026', time: '19:00', title: 'Höck & <Fondue>', place: 'Clubhaus' },
      { date: '12.12.2026', time: '', title: 'Samichlaus', place: '' },
      { date: '20.12.2026', time: '10:00', title: 'Ausfahrt', place: 'Steg' },
    ] });
    expect(html).toMatchInlineSnapshot(`
      "<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222">
      <h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#222222">Termine</h2>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td width="30%" style="padding:6px 12px 6px 0;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222;white-space:nowrap">04.12.2026<br />19:00</td><td style="padding:6px 0;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222"><strong>Höck &amp; &lt;Fondue&gt;</strong><br /><span style="color:#555555">Clubhaus</span></td></tr>
      <tr><td width="30%" style="padding:6px 12px 6px 0;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222;white-space:nowrap">12.12.2026</td><td style="padding:6px 0;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222"><strong>Samichlaus</strong></td></tr>
      </table>
      </td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222">
      <img src="https://bkaiser.imgix.net/tenant/scs/img/boot.jpg?auto=compress,format=jpg&amp;w=600" alt="Boot" width="600" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 0 16px 0" />
      <div style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;line-height:1.4;color:#555555">Eins<br />Zwei</div>
      <h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#222222">Titel &amp; &lt;mehr&gt;</h2>
      <h3 style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.4;color:#555555;font-weight:normal">Unter</h3>

      <div><h1>Hallo</h1><p style="margin:0 0 16px;color:#ff0000">Liebe <a href="/club">Mitglieder</a> &amp; Freunde</p><p style="margin:0 0 16px">Zwei</p></div>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0"><tr><td align="center" style="border-radius:4px;border:1px solid #222222">
      <a href="https://app.example.org/club" target="_blank" style="display:inline-block;padding:11px 27px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:#222222;text-decoration:none;border-radius:4px">Mehr</a>
      </td></tr></table>
      </td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 24px 0">
      <table cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="border-radius:4px;background-color:#222222">
      <a href="https://example.org/x?a=1&amp;b=2" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:4px">Jetzt &lt;anmelden&gt;</a>
      </td></tr></table>
      </td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222">
      <div style="margin:0 0 16px 0;font-style:italic;color:#666666">Unser Boot</div>



      <div style="margin:0 0 12px 0;color:#555555">Nur das</div>

      <table cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0 0"><tr><td align="center" style="border-radius:4px;border:1px solid #222222;background-color:#222222">
      <a href="mailto:a@b.ch" target="_blank" style="display:inline-block;padding:11px 27px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:4px">Los</a>
      </td></tr></table>
      </td></tr></table>"
    `);
  });

  it('a plain text', async () => {
    expect(await render(['a'], [article('a', '<p>Hallo</p><p>Bis bald</p>')])).toMatchInlineSnapshot(`
      "<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222">





      <div><p style="margin:0 0 16px">Hallo</p><p style="margin:0 0 16px">Bis bald</p></div>

      </td></tr></table>"
    `);
  });
});
