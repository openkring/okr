import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const state = vi.hoisted(() => ({
  addresses: [] as Record<string, unknown>[],
  /** page count of the fake letter render, by recipient name found in the html */
  letterPages: 1,
  attachment: undefined as Uint8Array | undefined,
  saved: [] as Buffer[],
  /** the html of every rendered letter page */
  htmls: [] as string[],
  /** a marker that, when the rendered html contains it, makes the letter one page longer (a block that overflows) */
  overflowWith: '',
  /** the tenant's own letter template (its html), when it has one */
  template: '',
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => ({ exists: true, data: () => (name === 'orgs' ? { name: 'Seeclub' }
          : name === 'templates' && state.template ? { tenants: ['scs'], currentVersion: 1 } : { firstName: id, lastName: 'Muster' }) }),
        collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ status: 'published', html: state.template, css: '' }) }) }) }),
      }),
      where: (_f: string, _o: string, parentKey: string) => ({
        where: () => ({
          get: async () => ({ docs: state.addresses.filter((a) => a['parentKey'] === parentKey).map((a) => ({ data: () => a })) }),
        }),
      }),
    }),
  }),
}));
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({
    file: () => ({
      download: async () => [Buffer.from(state.attachment ?? new Uint8Array())],
      save: async (b: Buffer) => { state.saved.push(b); },
    }),
  }),
}));
vi.mock('../pdf/browser-pool', () => ({
  getBrowser: async () => ({
    newPage: async () => ({
      setJavaScriptEnabled: async () => undefined,
      setRequestInterception: async () => undefined,
      on: () => undefined,
      setContent: async (html: string) => { state.htmls.push(html); },
      pdf: async () => {
        const d = await PDFDocument.create();
        const html = state.htmls.at(-1) ?? '';
        const pages = state.letterPages + (state.overflowWith && html.includes(state.overflowWith) ? 1 : 0);
        for (let i = 0; i < pages; i++) d.addPage();
        return d.save();
      },
      close: async () => undefined,
    }),
  }),
}));
vi.mock('../pdf/qr-slip', () => ({ resolvePayee: async () => ({}) }));

import {
  buildLetterHtml, buildMailingLetters, countLetterPages, type RenderedLetter, eventsBlockHtml, LETTER_QR_INTRO, LETTER_TEMPLATE_ORIGINS, qrSvgOf, withEventsBlock, escapeHtml, isAllowedLetterRequest, isPdfAttachment, isReapableLetters, isReapableSendingLetter, isUsableLetterTemplate,
  letterDate, letterPayload, letterTemplateKey, lettersPath, mayGetLetters, placeAndDate, LETTER_UNSUBSCRIBE_INTRO, unsubscribeLetterBlockHtml,
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

describe('per-letter PDFs of a sending (spec 1.150)', () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  const name = 'mailing-letters/m1/p1.pdf';
  const day = 24 * 60 * 60 * 1000;

  it('keeps a per-letter PDF of a sent record for 90 days', () => {
    const updatedAt = new Date(now - 89 * day).toISOString();
    expect(isReapableSendingLetter(name, now, { state: 'sent', updatedAt })).toBe(false);
  });

  it('deletes it after 90 days', () => {
    const updatedAt = new Date(now - 91 * day).toISOString();
    expect(isReapableSendingLetter(name, now, { state: 'sent', updatedAt })).toBe(true);
    expect(isReapableSendingLetter(name, now, { state: 'failed', updatedAt })).toBe(true);
  });

  it("never deletes a queued record's PDF", () => {
    const updatedAt = new Date(now - 400 * day).toISOString();
    expect(isReapableSendingLetter(name, now, { state: 'queued', updatedAt })).toBe(false);
    expect(isReapableSendingLetter(name, now, { state: 'submitted', updatedAt })).toBe(false);
  });

  it('never deletes on a missing or unreadable updatedAt', () => {
    expect(isReapableSendingLetter(name, now, { state: 'sent', updatedAt: '' })).toBe(false);
  });
});

async function pdfWithPages(n: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage();
  return d.save();
}

describe('letters rendered one by one (spec 1.150)', () => {
  const addr = (parentKey: string, countryCode: string): Record<string, unknown> => ({
    parentKey, addressChannel: 'postal', tenants: ['scs'], isFavorite: true,
    streetName: 'Dorfweg', streetNumber: '2', zipCode: '8000', city: 'Zürich', countryCode,
  });
  const base = { tenantId: 'scs', mailingKey: 'm1', subject: 'S', body: '<p>B</p>', attachments: [] as never[] };

  beforeEach(() => {
    state.letterPages = 2;
    state.attachment = undefined;
    state.saved = [];
    state.addresses = [addr('person.anna', ''), addr('person.beat', 'DE'), addr('org.club', 'CH')];
  });

  it('onLetter receives one PDF per recipient with its page count', async () => {
    state.attachment = await pdfWithPages(3);
    const got: RenderedLetter[] = [];
    const res = await buildMailingLetters({
      ...base, personKeys: ['anna', 'beat', 'org.club', 'nobody'],
      attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', storagePath: 'x/a.pdf' } as never],
      onLetter: async (l) => { got.push(l); },
    });
    expect(res).toMatchObject({ letters: 3, missing: 1 });
    expect(got.map((l) => [l.recipientKey, l.countryCode])).toEqual([['anna', 'CH'], ['beat', 'DE'], ['org.club', 'CH']]);
    expect(got[0].recipientName).toBe('anna Muster');
    for (const l of got) {
      expect(l.pages).toBe(5);
      expect((await PDFDocument.load(l.pdf)).getPageCount()).toBe(5);
    }
  });

  it('a household key gets the household name and the contact\'s address, and keeps its key', async () => {
    const got: RenderedLetter[] = [];
    const urls: string[] = [];
    const res = await buildMailingLetters({
      ...base, personKeys: ['household.h1', 'household.gone'],
      households: new Map([['household.h1', { contactKey: 'beat', name: 'Familie Muster' }]]),
      answerEvents: [{ name: 'GV', when: '01.12.2026', location: 'Stäfa' }], answerUrl: (k) => { urls.push(k); return `https://x/${k}`; },
      onLetter: async (l) => { got.push(l); },
    });
    expect(res).toMatchObject({ letters: 1, missing: 1 });
    expect(got.map((l) => [l.recipientKey, l.recipientName, l.countryCode])).toEqual([['household.h1', 'Familie Muster', 'DE']]);
    // the answer link of a household letter is the contact's own
    expect(urls).toEqual(['beat']);
  });

  it('only filters which letters go into the combined PDF, onLetter still sees all', async () => {
    const got: string[] = [];
    const res = await buildMailingLetters({
      ...base, personKeys: ['anna', 'beat'],
      onLetter: async (l) => { got.push(l.recipientKey); },
      only: (l) => l.countryCode !== 'CH',
    });
    expect(got).toEqual(['anna', 'beat']);
    expect(res).toMatchObject({ letters: 1, missing: 0 });
    expect((await PDFDocument.load(state.saved[0])).getPageCount()).toBe(2);
  });

  it('without onLetter and only, every letter is in the combined PDF', async () => {
    const res = await buildMailingLetters({ ...base, personKeys: ['anna', 'beat'] });
    expect(res).toMatchObject({ letters: 2 });
    expect((await PDFDocument.load(state.saved[0])).getPageCount()).toBe(4);
  });

  it('countLetterPages equals the pages of a rendered letter', async () => {
    state.attachment = await pdfWithPages(3);
    const attachments = [{ filename: 'a.pdf', contentType: 'application/pdf', storagePath: 'x/a.pdf' } as never];
    const got: RenderedLetter[] = [];
    await buildMailingLetters({ ...base, attachments, personKeys: ['anna'], onLetter: async (l) => { got.push(l); } });
    const n = await countLetterPages({ tenantId: 'scs', subject: 'S', body: '<p>B</p>', attachments, withQrBlock: false });
    expect(n).toBe(got[0].pages);
    expect(n).toBe(5);
  });

  it('counts pages of an inline PDF attachment', async () => {
    const content = Buffer.from(await pdfWithPages(3));
    const n = await countLetterPages({
      tenantId: 'scs', subject: 'S', body: '<p>B</p>', withQrBlock: false,
      attachmentBytes: [{ filename: 'a.pdf', contentType: 'application/pdf', content }, { filename: 'b.png', contentType: 'image/png', content: Buffer.from('x') }],
    });
    expect(n).toBe(5);
  });

  it('an unreadable PDF attachment is invalid-argument', async () => {
    await expect(countLetterPages({
      tenantId: 'scs', subject: 'S', body: '<p>B</p>', withQrBlock: false,
      attachmentBytes: [{ filename: 'bad.pdf', contentType: 'application/pdf', content: Buffer.from('not a pdf') }],
    })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('countLetterPages renders the QR block when asked', async () => {
    const events = [{ name: 'GV', when: '01.12.2026, 19:30', location: 'Stäfa' }];
    const n = await countLetterPages({ tenantId: 'scs', subject: 'S', body: '<p>B</p>', attachments: [], withQrBlock: true, answerEvents: events });
    expect(n).toBe(2);
  });
});

describe('unsubscribeLetterBlockHtml', () => {
  it('prints the link as escaped text with its QR code, and is empty without either', () => {
    const html = unsubscribeLetterBlockHtml('https://u/?p=1&g=2', '<svg viewBox="0 0 1 1"></svg>');
    expect(html).toContain('https://u/?p=1&amp;g=2');
    expect(html).toContain('<svg width="100%" height="100%" viewBox');
    expect(html).toContain(escapeHtml(LETTER_UNSUBSCRIBE_INTRO));
    expect(html).toContain('page-break-inside:avoid');
    expect(unsubscribeLetterBlockHtml('', '<svg></svg>')).toBe('');
    expect(unsubscribeLetterBlockHtml('https://u', '')).toBe('');
  });
});

describe('newsletter letters (spec 1.169 §5.4)', () => {
  const addr = (parentKey: string): Record<string, unknown> => ({
    parentKey, addressChannel: 'postal', tenants: ['scs'], isFavorite: true,
    streetName: 'Dorfweg', streetNumber: '2', zipCode: '8000', city: 'Zürich', countryCode: '',
  });

  beforeEach(() => {
    state.letterPages = 1;
    state.attachment = undefined;
    state.saved = [];
    state.htmls = [];
    state.addresses = [addr('person.anna'), addr('person.beat'), addr('org.club')];
  });

  it('prints each person\'s own unsubscribe link as text and a QR code below the text', async () => {
    const urlOf = (k: string) => `https://u/newsletterUnsubscribe?p=${k}&g=nl`;
    await buildMailingLetters({
      tenantId: 'scs', mailingKey: 'm1', subject: 'S', body: '<p>B</p>', attachments: [],
      personKeys: ['anna', 'beat', 'org.club'], unsubscribeUrl: urlOf,
    });
    expect(state.htmls).toHaveLength(3);
    const [anna, beat, club] = state.htmls;
    expect(anna).toContain(escapeHtml(urlOf('anna')));
    expect(anna).not.toContain('p=beat');
    expect(beat).toContain(escapeHtml(urlOf('beat')));
    for (const html of [anna, beat]) {
      expect(html.indexOf('okr-letter-unsubscribe')).toBeGreaterThan(html.indexOf('<p>B</p>'));
      expect(html.match(/<svg\b/g)).toHaveLength(1);
    }
    // an org is no subscriber: no link, no QR code
    expect(club).not.toContain('okr-letter-unsubscribe');
  });

  it('puts the unsubscribe block after the events block when the letter has both', async () => {
    await buildMailingLetters({
      tenantId: 'scs', mailingKey: 'm1', subject: 'S', body: '<p>B</p>', attachments: [], personKeys: ['anna'],
      answerEvents: [{ name: 'GV', when: '01.12.2026', location: 'Stäfa' }], answerUrl: (k) => `https://a/?p=${k}`,
      unsubscribeUrl: (k) => `https://u/?p=${k}`,
    });
    const [html] = state.htmls;
    expect(html.indexOf('okr-letter-unsubscribe')).toBeGreaterThan(html.indexOf('okr-letter-events'));
    expect(html.match(/<svg\b/g)).toHaveLength(2);
  });

  it('prints no unsubscribe block on an ordinary Versand', async () => {
    await buildMailingLetters({ tenantId: 'scs', mailingKey: 'm1', subject: 'S', body: '<p>B</p>', attachments: [], personKeys: ['anna'] });
    expect(state.htmls[0]).not.toContain('okr-letter-unsubscribe');
  });
});

describe('the page count of a newsletter letter (Pingen quote)', () => {
  beforeEach(() => {
    state.letterPages = 1;
    state.attachment = undefined;
    state.saved = [];
    state.htmls = [];
    state.overflowWith = 'okr-letter-unsubscribe';     // the unsubscribe block pushes the letter onto a second page
    state.addresses = [{
      parentKey: 'person.anna', addressChannel: 'postal', tenants: ['scs'], isFavorite: true,
      streetName: 'Dorfweg', streetNumber: '2', zipCode: '8000', city: 'Zürich', countryCode: '',
    }];
  });

  it('counts the page the unsubscribe block adds, exactly as the sent letter has it', async () => {
    const url = 'https://u/newsletterUnsubscribe?p=anna&g=nl1&h=x';
    const plain = await countLetterPages({ tenantId: 'scs', subject: 'S', body: '<p>B</p>', withQrBlock: false });
    const counted = await countLetterPages({ tenantId: 'scs', subject: 'S', body: '<p>B</p>', withQrBlock: false, unsubscribeUrl: url });
    expect(plain).toBe(1);
    expect(counted).toBe(2);
    expect(state.htmls.at(-1)).toContain(escapeHtml(url));
    const got: RenderedLetter[] = [];
    await buildMailingLetters({
      tenantId: 'scs', mailingKey: 'm1', subject: 'S', body: '<p>B</p>', attachments: [], personKeys: ['anna'],
      unsubscribeUrl: () => url, onLetter: async (l) => { got.push(l); },
    });
    expect(got[0].pages).toBe(counted);
  });
});

describe('pictures of a letter made of blocks (spec 1.176 §9.4)', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const DATA = `data:image/jpeg;base64,${JPEG.toString('base64')}`;
  const BODY = '<p>B</p><img src="https://bkaiser.imgix.net/tenant/scs/geheim.jpg?w=880&amp;fit=max" alt="Boot" />';
  const EMBEDDED = `<p>B</p><img src="${DATA}" alt="Boot" />`;
  const fetchMock = vi.fn<typeof fetch>();
  const build = (over: Partial<Parameters<typeof buildMailingLetters>[0]> = {}) => buildMailingLetters({
    tenantId: 'scs', mailingKey: 'm1', subject: 'S', body: BODY, attachments: [], personKeys: ['anna', 'beat', 'cara'], embedImages: true, ...over,
  });
  const count = (over: Partial<Parameters<typeof countLetterPages>[0]> = {}) =>
    countLetterPages({ tenantId: 'scs', subject: 'S', body: BODY, withQrBlock: false, embedImages: true, ...over });

  beforeEach(() => {
    state.letterPages = 1;
    state.overflowWith = '';
    state.attachment = undefined;
    state.saved = [];
    state.htmls = [];
    state.template = '';
    state.addresses = ['anna', 'beat', 'cara'].map((key) => ({
      parentKey: `person.${key}`, addressChannel: 'postal', tenants: ['scs'], isFavorite: true, streetName: 'Dorfweg', streetNumber: '2', zipCode: '8000', city: 'Zürich', countryCode: '',
    }));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(new Uint8Array(JPEG), { headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    state.template = '';
  });

  it('prints them inside every letter, fetched once for all recipients', async () => {
    expect((await build())?.letters).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.htmls).toHaveLength(3);
    for (const html of state.htmls) {
      expect(html).toContain(`<div class="body">${EMBEDDED}</div>`);
      expect(html).not.toContain('https://bkaiser.imgix.net');
    }
  });

  it('prints them inside a letter of the tenant\'s own template, too', async () => {
    state.template = '<html><body><h1>{{lastName}}</h1>{{{body}}}</body></html>';
    await build({ personKeys: ['anna'] });
    expect(state.htmls[0]).toContain('<h1>Muster</h1>');
    expect(state.htmls[0]).toContain(EMBEDDED);
    expect(state.htmls[0]).not.toContain('https://bkaiser.imgix.net');
  });

  it('counts the pages of the same html as the letters print', async () => {
    state.overflowWith = DATA;
    const got: RenderedLetter[] = [];
    await build({ personKeys: ['anna'], onLetter: async (l) => { got.push(l); } });
    expect(await count()).toBe(2);
    expect(got[0].pages).toBe(2);
    expect(state.htmls[1]).toContain(`<div class="body">${EMBEDDED}</div>`);
  });

  it('a picture that cannot be fetched fails the quote with a code', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
    await expect(count()).rejects.toMatchObject({ code: 'unavailable', message: 'letter-picture' });
    await expect(count({ body: '<img src="https://elsewhere.example/a.jpg" />' })).rejects.toMatchObject({ code: 'unavailable', message: 'letter-picture' });
    expect(state.htmls).toEqual([]);
  });

  it('a picture that cannot be fetched fails the letters: none is rendered, handed on or stored', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
    const onLetter = vi.fn(async () => undefined);
    await expect(build({ onLetter })).rejects.toThrow('A picture of the letter could not be loaded: HTTP 404.');
    expect(onLetter).not.toHaveBeenCalled();
    expect([...state.htmls, ...state.saved]).toEqual([]);
  });

  it('without the flag the html is untouched and nothing is fetched', async () => {
    for (const embedImages of [undefined, false]) {
      state.htmls = [];
      await build({ embedImages, personKeys: ['anna'] });
      await count({ embedImages });
      expect(state.htmls).toHaveLength(2);
      for (const html of state.htmls) expect(html).toContain(`<div class="body">${BODY}</div>`);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
