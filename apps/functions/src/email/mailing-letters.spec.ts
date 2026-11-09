import { describe, expect, it } from 'vitest';
import {
  buildLetterHtml, eventsBlockHtml, LETTER_QR_INTRO, LETTER_TEMPLATE_ORIGINS, qrSvgOf, withEventsBlock, escapeHtml, isAllowedLetterRequest, isPdfAttachment, isReapableLetters, isUsableLetterTemplate,
  letterDate, letterPayload, letterTemplateKey, lettersPath, mayGetLetters, placeAndDate,
} from './mailing-letters';

describe('buildLetterHtml', () => {
  const html = buildLetterHtml({
    sender: { name: 'Seeclub <Stäfa>', street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
    recipient: { name: 'Anna Muster', street: 'Dorfweg 2', zipCity: '8000 Zürich' },
    placeAndDate: 'Stäfa, 7.11.2026', subject: 'GV & Apéro', body: '<p>Liebe Mitglieder</p>',
  });

  it('puts the recipient in the window and escapes the plain fields', () => {
    expect(html).toContain('<div class="address">Anna Muster<br>Dorfweg 2<br>8000 Zürich</div>');
    expect(html).toContain('Seeclub &lt;Stäfa&gt;');
    expect(html).toContain('GV &amp; Apéro');
  });

  it('keeps the sanitised body as HTML', () => {
    expect(html).toContain('<div class="body"><p>Liebe Mitglieder</p></div>');
  });
});

describe('placeAndDate', () => {
  it('takes the city without the zip code', () => {
    expect(placeAndDate('8712 Stäfa', new Date(2026, 10, 7))).toBe('Stäfa, 7.11.2026');
    expect(placeAndDate('', new Date(2026, 0, 2))).toBe('2.1.2026');
  });
});

describe('helpers', () => {
  it('escapes html', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('knows a pdf by type or name', () => {
    expect(isPdfAttachment({ filename: 'a.PDF', contentType: 'application/octet-stream' })).toBe(true);
    expect(isPdfAttachment({ filename: 'a.jpg', contentType: 'image/jpeg' })).toBe(false);
  });

  it('builds the storage path under the letters prefix', () => {
    expect(lettersPath('scs', 'm1')).toBe('mailing-letters/scs/m1.pdf');
  });
});

describe('mayGetLetters', () => {
  const mailing = { tenants: ['scs'], senderUid: 'u1' };

  it('lets the sender and memberAdmin/privileged of the tenant download', () => {
    expect(mayGetLetters(mailing, 'u1', {})).toBe(true);
    expect(mayGetLetters(mailing, 'u2', { tenants: ['scs'], roles: { privileged: true } })).toBe(true);
  });

  it('refuses others and other tenants', () => {
    expect(mayGetLetters(mailing, 'u2', { tenants: ['scs'], roles: { registered: true } })).toBe(false);
    expect(mayGetLetters(mailing, 'u2', { tenants: ['kwa'], roles: { memberAdmin: true } })).toBe(false);
    expect(mayGetLetters(mailing, '', {})).toBe(false);
  });
});

describe('isReapableLetters', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');

  it('reaps letters older than 7 days only', () => {
    expect(isReapableLetters('mailing-letters/scs/m1.pdf', '2026-11-10T00:00:00Z', now)).toBe(true);
    expect(isReapableLetters('mailing-letters/scs/m1.pdf', '2026-11-15T00:00:00Z', now)).toBe(false);
  });

  it('never touches anything outside the letters prefix', () => {
    expect(isReapableLetters('mailings/scs/m1/0-a.pdf', '2020-01-01T00:00:00Z', now)).toBe(false);
    expect(isReapableLetters('mailing-letters/scs/m1.pdf', undefined, now)).toBe(false);
  });
});

describe('letter template', () => {
  const doc = { kind: 'pdf', tenants: ['scs'], isArchived: false, currentVersion: 1 };
  const version = { status: 'published', html: '<p>{{{body}}}</p>' };

  it('lives under a fixed key per tenant', () => {
    expect(letterTemplateKey('scs')).toBe('mailing-letter_scs');
  });

  it('is used only when it is the tenant\'s own, live and published', () => {
    expect(isUsableLetterTemplate(doc, version, 'scs')).toBe(true);
    expect(isUsableLetterTemplate({ ...doc, kind: undefined }, version, 'scs')).toBe(true);
    expect(isUsableLetterTemplate(doc, version, 'kwa')).toBe(false);
    expect(isUsableLetterTemplate({ ...doc, tenants: ['scs', 'system'] }, version, 'scs')).toBe(false);
    expect(isUsableLetterTemplate({ ...doc, isArchived: true }, version, 'scs')).toBe(false);
    expect(isUsableLetterTemplate({ ...doc, currentVersion: 0 }, version, 'scs')).toBe(false);
    expect(isUsableLetterTemplate({ ...doc, kind: 'emailLayout' }, version, 'scs')).toBe(false);
    expect(isUsableLetterTemplate(doc, { ...version, status: 'draft' }, 'scs')).toBe(false);
    expect(isUsableLetterTemplate(doc, { ...version, html: '' }, 'scs')).toBe(false);
    expect(isUsableLetterTemplate(undefined, version, 'scs')).toBe(false);
    // partials and assets would be per-template state on the shared Handlebars instance
    expect(isUsableLetterTemplate(doc, { ...version, partials: { head: '<b>x</b>' } }, 'scs')).toBe(false);
    expect(isUsableLetterTemplate(doc, { ...version, assets: [{ key: 'logo', storagePath: 'a/b.png' }] as never }, 'scs')).toBe(false);
    expect(isUsableLetterTemplate(doc, { ...version, partials: {}, assets: [] }, 'scs')).toBe(true);
  });

  it('hands the template the address lines, the single fields, the subject and the body', () => {
    const payload = letterPayload({
      recipient: {
        name: 'Anna Muster', firstName: 'Anna', lastName: 'Muster', street: 'Dorfweg 2', zipCity: '8000 Zürich',
        streetName: 'Dorfweg', streetNumber: '2', zipCode: '8000', city: 'Zürich', countryCode: 'CH',
      },
      sender: { name: 'Seeclub Stäfa', street: 'Seestrasse 1', zipCity: '8712 Stäfa' },
      date: '07.11.2026', placeAndDate: 'Stäfa, 7.11.2026', subject: 'GV', body: '<p>Hallo</p>',
    });
    expect(payload).toMatchObject({
      name: 'Anna Muster', street: 'Dorfweg 2', zipCity: '8000 Zürich', zipCode: '8000', city: 'Zürich',
      date: '07.11.2026', subject: 'GV', body: '<p>Hallo</p>', sender: { name: 'Seeclub Stäfa' },
    });
  });

  it('writes the date as DD.MM.YYYY', () => {
    expect(letterDate(new Date(2026, 10, 7))).toBe('07.11.2026');
  });

  it('lets the page load only data: URIs and the fixed image CDN, never an origin from the template', () => {
    expect([...LETTER_TEMPLATE_ORIGINS]).toEqual(['https://bkaiser.imgix.net']);
    expect(isAllowedLetterRequest('data:image/png;base64,AAA', LETTER_TEMPLATE_ORIGINS)).toBe(true);
    expect(isAllowedLetterRequest('https://bkaiser.imgix.net/tenant/scs/logo/scs-wordmark.png', LETTER_TEMPLATE_ORIGINS)).toBe(true);
    expect(isAllowedLetterRequest('https://evil.example/track.png?street=Seestrasse', LETTER_TEMPLATE_ORIGINS)).toBe(false);
    expect(isAllowedLetterRequest('http://bkaiser.imgix.net/x.png', LETTER_TEMPLATE_ORIGINS)).toBe(false);
    expect(isAllowedLetterRequest('https://bkaiser.imgix.net/x', new Set())).toBe(false);
  });
});

describe('eventsBlockHtml', () => {
  const events = [
    { name: 'GV <2026>', when: '01.12.2026, 19:30', location: 'Bootshaus' },
    { name: 'Chlaus', when: '06.12.2026', location: '' },
  ];

  it('is empty without events or without a QR code', () => {
    expect(eventsBlockHtml([], '<svg></svg>')).toBe('');
    expect(eventsBlockHtml(events, '')).toBe('');
  });

  it('leads every event with the QR code, escapes the details and keeps the block on one page', () => {
    const html = eventsBlockHtml(events, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"></svg>');
    expect(html.match(/<svg width="100%" height="100%"/g)?.length).toBe(2);
    expect(html).toContain('<strong>GV &lt;2026&gt;</strong><br>01.12.2026, 19:30<br>Bootshaus');
    expect(html).toContain('<strong>Chlaus</strong><br>06.12.2026</td>');
    expect(html).toContain(LETTER_QR_INTRO);
    expect(html.startsWith('<div class="okr-letter-events" style="break-inside:avoid;page-break-inside:avoid;')).toBe(true);
    expect(html.match(/<tr style="break-inside:avoid;page-break-inside:avoid;">/g)?.length).toBe(2);
  });
});

describe('withEventsBlock', () => {
  it('goes before the last </body>', () => {
    expect(withEventsBlock('<html><body><p>x</p></BODY></html>', '<div>E</div>')).toBe('<html><body><p>x</p><div>E</div></BODY></html>');
  });
  it('is appended to a fragment and leaves the page alone without a block', () => {
    expect(withEventsBlock('<p>x</p>', '<div>E</div>')).toBe('<p>x</p><div>E</div>');
    expect(withEventsBlock('<body></body>', '')).toBe('<body></body>');
  });
});

describe('qrSvgOf', () => {
  it('encodes the link as an SVG', async () => {
    const svg = await qrSvgOf('https://example.org/answer?m=1&p=2&s=3');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox');
  });
});

describe('buildLetterHtml with events', () => {
  it('puts the events block below the text', () => {
    const html = buildLetterHtml({
      sender: { name: 'S', street: '', zipCity: '' }, recipient: { name: 'R', street: '', zipCity: '' },
      placeAndDate: '', subject: 'S', body: '<p>Text</p>', eventsHtml: '<div class="okr-letter-events"></div>',
    });
    expect(html.indexOf('<p>Text</p>')).toBeLessThan(html.indexOf('okr-letter-events'));
  });
});
