// One rendering per send (spec 1.176 §9): a Versand from its mail page through quote, sendMailing and onMailing, on an
// in-memory Firestore.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  letters: [] as Record<string, unknown>[],
  counted: [] as Record<string, unknown>[],
  deleted: [] as unknown[],
}));

vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return { ...actual, onCall: (_o: unknown, fn: unknown) => fn, onRequest: (_o: unknown, fn: unknown) => fn };
});
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'secret' }), projectID: { value: () => 'proj' } }));
vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/firestore')>('firebase-admin/firestore');
  return { ...actual, getFirestore: () => h.db };
});
vi.mock('@okr/shared-util-functions', async () => {
  const actual = await vi.importActual<typeof import('@okr/shared-util-functions')>('@okr/shared-util-functions');
  return { ...actual, checkAppCheckToken: () => undefined, checkAuthentication: () => undefined };
});
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({ file: () => ({ save: async () => undefined }), deleteFiles: async (o: unknown) => { h.deleted.push(o); } }),
}));
vi.mock('../auth/email-templates', async () => {
  const actual = await vi.importActual<typeof import('../auth/email-templates')>('../auth/email-templates');
  return { ...actual, getAppEmailConfig: async () => ({ from: 'Verein <no-reply@x.ch>', senderDomain: 'x.ch' }) };
});
vi.mock('../srv/push', async () => {
  const actual = await vi.importActual<typeof import('../srv/push')>('../srv/push');
  return { ...actual, pushToPersons: async (keys: string[]) => ({ sent: keys.length }) };
});
vi.mock('./render-email', async () => {
  const actual = await vi.importActual<typeof import('./render-email')>('./render-email');
  return { ...actual, renderEmail: async (o: { body: string }) => ({ html: `<html>${o.body}</html>` }) };
});
vi.mock('./mailing-letters', async () => {
  const actual = await vi.importActual<typeof import('./mailing-letters')>('./mailing-letters');
  return {
    ...actual,
    postalOf: async () => ({ countryCode: 'CH' }),
    countLetterPages: async (args: Record<string, unknown>) => { h.counted.push(args); return 2; },
    buildMailingLetters: async (args: Record<string, unknown>) => { h.letters.push(args); return { storagePath: 'x.pdf', letters: 1, missing: 0 }; },
  };
});

import { fakeDb, type Doc, type Store } from '../credit/testing/credit-fake-db';
import { sanitizeEmailBody } from '../pdf/sanitize';
import { bindCreditPort, getCreditPort, type CreditPort } from '../pingen/credit-port';
import { draftHashOf, quoteWithCaller, signQuote, type PostQuote } from '../pingen/quote';
import type { MailJobDoc } from './mail-job';
import { MAX_CONTENT_BYTES, type SentContent } from './mail-page/mail-content';
import { mailPageContent, type MailingDoc, onMailing, sendMailing } from './mailing';

const T = 'scs';
const PAGE = 'pg1';
type Run<Req, Res> = (req: Req) => Promise<Res>;
const callSend = sendMailing as unknown as Run<{ data: Record<string, unknown>; auth: { uid: string } }, { mailingKey: string }>;
const runOnMailing = onMailing as unknown as Run<{ data: { id: string; data(): unknown; ref: unknown } }, void>;

const text = (id: string, html: string) => ({ id, type: 'text', html });
const BLOCKS: unknown[] = [
  text('t', '<p>Liebe Mitglieder</p>'),
  { id: 'b', type: 'button', cta: { label: 'Zum Club', url: '/club', style: 'primary' } },
  { id: 'e', type: 'events', calendarKey: 'club', maxEvents: 5, title: 'Anlässe' },
];

let store: Store;
let deductions: unknown[];

function setPage(sections: Record<string, Doc>, over: Doc = {}): void {
  store[`mailPages/${PAGE}`] = { tenants: [T], senderUid: 'admin', type: 'mail', createdAt: '2026-11-25T10:00:00.000Z', sections: Object.keys(sections), ...over };
  for (const [key, section] of Object.entries(sections)) store[`mailPages/${PAGE}/sections/${key}`] = section;
}
const blockArticle = (blocks: unknown): Doc => ({ type: 'article', tenants: [T], title: 'Alter Titel', content: { htmlContent: '<p>Alter Text</p>' }, properties: { images: [], blocks } });
const oldArticle: Doc = { type: 'article', tenants: [T], title: 'Titel', content: { htmlContent: '<p>Alter Text</p>' }, properties: { images: [] } };
const OLD_HTML = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222222">


<h2 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#222222">Titel</h2>


<div><p style="margin:0 0 16px">Alter Text</p></div>

</td></tr></table>`;

const request = (over: Record<string, unknown> = {}, uid = 'admin') => ({
  auth: { uid },
  data: { tenantId: T, subject: 'Herbst', pageKey: PAGE, to: ['info@club.ch'], deliveries: [{ personKey: 'p1', channels: ['email', 'chat'] }], ...over },
});
const docsOf = (collection: string): [string, Doc][] => Object.entries(store).filter(([p]) => p.startsWith(`${collection}/`));
const mailings = (): [string, Doc][] => docsOf('mailings').filter(([p]) => p.split('/').length === 2);
const contents = (): [string, Doc][] => docsOf('mailings').filter(([p]) => p.endsWith('/content/sent'));

beforeEach(() => {
  store = {
    'users/admin': { roles: { privileged: true }, tenants: [T], personKey: 'boss', displayName: 'Boss' },
    'users/u1': { personKey: 'p1', tenants: [T] },
    [`address-directory/${T}_person.p1`]: { favEmail: 'p1@x.ch' },
    [`app-config/${T}`]: { appDomain: 'app.example.ch', brandColor: '#014DA2' },
    'calevents/ours': { tenants: [T], calendars: ['club'], name: 'Fondue', startDate: '20991204', startTime: '1900', isArchived: false, locations: [] },
    'calevents/foreign': { tenants: ['other'], calendars: ['club'], name: 'Fremder Anlass', startDate: '20991204', startTime: '1900', isArchived: false, locations: [] },
  };
  h.db = fakeDb(store);
  h.letters = [];
  h.counted = [];
  h.deleted = [];
  deductions = [];
  const port: CreditPort = {
    quote: (letters, pages) => ({ total: letters * 120 + pages * 30, perUnit: 120, perPage: 30 }),
    balance: async () => 10_000,
    deduct: async (_t, input) => { deductions.push(input); return { entryId: 'e1', balanceAfter: 0 }; },
    reverseShare: async () => ({ amount: 0, duplicate: false }),
  };
  bindCreditPort(port);
});

describe('mailPageContent', () => {
  it('lists the events of the block\'s calendar, of this tenant only, in the tenant\'s colour and with its app\'s address', async () => {
    setPage({ s1: blockArticle(BLOCKS) });
    const { html, letterHtml, notice, page } = await mailPageContent(T, PAGE, 'admin');
    for (const part of [html, letterHtml, JSON.stringify(notice)]) {
      expect(part).toContain('Fondue');
      expect(part).not.toContain('Fremder Anlass');
      expect(part).not.toContain('Alter');
    }
    expect(html).toContain('#014da2');
    expect(html).toContain('href="https://app.example.ch/club"');
    expect(page).toMatchObject({ okey: PAGE, senderUid: 'admin' });
  });

  it('is dark grey without a usable brand colour', async () => {
    setPage({ s1: blockArticle(BLOCKS) });
    for (const brandColor of [undefined, '', 'red', '#fff', 7]) {
      store[`app-config/${T}`] = { appDomain: 'app.example.ch', brandColor };
      expect((await mailPageContent(T, PAGE, 'admin')).html).toContain('background-color:#222222');
    }
  });

  it('asks for no calendar without a key, or with a slash in it', async () => {
    const asked: unknown[] = [];
    const db = fakeDb(store) as unknown as { collection(n: string): { where(...a: unknown[]): unknown } };
    h.db = { ...db, collection: (name: string) => {
      const col = db.collection(name);
      return name === 'calevents' ? { ...col, where: (...a: unknown[]) => { asked.push(a[2]); return col.where(...a); } } : col;
    } };
    setPage({ s1: blockArticle([text('t', '<p>x</p>'), { id: 'e', type: 'events', calendarKey: 'a/b', maxEvents: 5 }]) });
    await mailPageContent(T, PAGE, 'admin');
    setPage({ s1: blockArticle([text('t', '<p>x</p>'), { id: 'e', type: 'events', calendarKey: ' ', maxEvents: 5 }]) });
    await expect(mailPageContent(T, PAGE, 'admin')).rejects.toMatchObject({ message: 'invalid-block', details: { blockId: 'e' } });
    expect(asked).toEqual([]);
  });

  it('gives the html of a page without blocks and nothing else', async () => {
    setPage({ s1: oldArticle });
    const { page, ...content } = await mailPageContent(T, PAGE, 'admin');
    expect(page.okey).toBe(PAGE);
    expect(content).toStrictEqual({ html: OLD_HTML });
  });
});

describe('sendMailing of a page with blocks', () => {
  beforeEach(() => setPage({ s1: blockArticle(BLOCKS) }));

  it('stores the mail on the mailing, letter and Mitteilung beside it', async () => {
    const content = await mailPageContent(T, PAGE, 'admin');
    const { mailingKey } = await callSend(request());
    expect(store[`mailings/${mailingKey}`]).toMatchObject({ body: content.html, pageKey: PAGE });
    expect(store[`mailings/${mailingKey}`]).not.toHaveProperty('letterBody');
    expect(store[`mailings/${mailingKey}/content/sent`]).toStrictEqual({ letterBody: content.letterHtml, noticeBlocks: content.notice });
  });

  it('builds the web version from the same html', async () => {
    const { mailingKey } = await callSend(request({ webVersion: true }));
    const mailing = store[`mailings/${mailingKey}`] as unknown as MailingDoc;
    expect(store[`mailingWeb/${mailing.webToken}`]).toMatchObject({ mailingKey, html: `<html>${mailing.body}</html>` });
  });

  it('stamps on the page what it was sent with', async () => {
    const { mailingKey } = await callSend(request({ subject: '  Herbst  ', layout: 'plain', webVersion: true }));
    expect(store[`mailPages/${PAGE}`]).toMatchObject({ mailingKey, subject: 'Herbst', layout: 'plain', webVersion: true });
    expect(store[`mailPages/${PAGE}`]).toMatchObject({ subject: store[`mailings/${mailingKey}`]['subject'], layout: store[`mailings/${mailingKey}`]['layout'] });
  });

  it('stamps the layout and the web version as the server decided them', async () => {
    // no E-Mail delivery: nobody would get the link
    await callSend(request({ layout: '../x', webVersion: true, deliveries: [{ personKey: 'p1', channels: ['chat'] }] }));
    expect(store[`mailPages/${PAGE}`]).toMatchObject({ layout: 'standard', webVersion: false });
  });

  it('refuses a block that cannot be rendered, by name, and stores nothing', async () => {
    setPage({ s1: blockArticle([text('t', '<p>x</p>'), { id: 'm', type: 'map' }]) });
    await expect(callSend(request())).rejects.toMatchObject({ code: 'failed-precondition', message: 'unknown-block-type', details: { blockId: 'm' } });
    expect(docsOf('mailings')).toEqual([]);
    expect(store[`mailPages/${PAGE}`]).not.toHaveProperty('mailingKey');
  });

  it('refuses a mail that is too long', async () => {
    setPage({ s1: blockArticle([text('t', `<p>${'x'.repeat(MAX_CONTENT_BYTES)}</p>`)]) });
    await expect(callSend(request())).rejects.toMatchObject({ code: 'failed-precondition', message: 'too-large' });
    expect(docsOf('mailings')).toEqual([]);
  });

  it('sends one page once: the second of two sends leaves no content', async () => {
    const results = await Promise.allSettled([callSend(request()), callSend(request())]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'failed-precondition', message: 'sent' } });
    expect(mailings()).toHaveLength(1);
    expect(contents().map(([p]) => p)).toEqual([`${mailings()[0][0]}/content/sent`]);
    expect(h.deleted).toHaveLength(1);
  });
});

describe('sendMailing of a page without blocks', () => {
  beforeEach(() => setPage({ s1: oldArticle }));

  it('stores the body as before and no content', async () => {
    const { mailingKey } = await callSend(request());
    expect(store[`mailings/${mailingKey}`]['body']).toBe(OLD_HTML);
    expect(contents()).toEqual([]);
    expect(store[`mailPages/${PAGE}`]).toMatchObject({ mailingKey, subject: 'Herbst', layout: 'standard', webVersion: false });
  });
});

describe('quote and Pingen send', () => {
  const OPTIONS = { deliveryProduct: 'cheap', printSpectrum: 'grayscale', printMode: 'simplex' } as const;
  const post = [{ personKey: 'p1', channels: ['post'] }];
  async function quote(): Promise<PostQuote> {
    const result = await quoteWithCaller({
      getPort: getCreditPort, secret: 'secret', now: Date.now(), hasCreditAccount: async () => true,
      readCountryCodes: async () => ['CH'], answerEventsOf: async () => [], renderPages: async (a) => { h.counted.push(a); return 2; },
    }, { tenantId: T, subject: 'Herbst', pageKey: PAGE, postKeys: ['p1'], options: OPTIONS }, { roles: { privileged: true }, tenants: [T] }, 'admin');
    return result as PostQuote;
  }
  const send = (q: PostQuote) => callSend(request({ deliveries: post, post: { via: 'pingen', options: OPTIONS, token: q.token, issuedAt: q.issuedAt } }));

  it('price and print the same letter of a page with blocks', async () => {
    setPage({ s1: blockArticle(BLOCKS) });
    const { letterHtml, html } = await mailPageContent(T, PAGE, 'admin');
    const { mailingKey } = await send(await quote());
    expect(deductions).toHaveLength(1);
    expect(store[`mailings/${mailingKey}`]).toMatchObject({ body: html, post: { via: 'pingen', letters: 1, pages: 2 } });
    expect(h.counted.map((c) => c['body'])).toEqual([await sanitizeEmailBody(letterHtml ?? ''), await sanitizeEmailBody(letterHtml ?? '')]);
    expect(letterHtml).not.toBe(html);
  });

  it('a replay of a sent page is the same Versand, without a second deduction', async () => {
    setPage({ s1: blockArticle(BLOCKS) });
    const q = await quote();
    const first = await send(q);
    expect(await send(q)).toEqual(first);
    expect(deductions).toHaveLength(1);
    expect(contents()).toHaveLength(1);
  });

  it('refuses when a block changed since the quote', async () => {
    setPage({ s1: blockArticle(BLOCKS) });
    const q = await quote();
    setPage({ s1: blockArticle([text('t', '<p>Anders</p>')]) });
    await expect(send(q)).rejects.toMatchObject({ code: 'failed-precondition', message: 'price-changed' });
    expect(deductions).toEqual([]);
    expect(docsOf('mailings')).toEqual([]);
  });

  it('a page without blocks hashes its html, as before', async () => {
    setPage({ s1: oldArticle });
    const q = await quote();
    expect(q.token).toBe(signQuote({
      iat: q.issuedAt, tenantId: T, recipients: ['p1'], options: OPTIONS, letters: 1, pages: 2, total: 180,
      draftHash: draftHashOf({ subject: 'Herbst', body: OLD_HTML, attachments: [], letterQrCodes: false, caleventKeys: [] }),
    }, 'secret'));
    await send(q);
    expect(deductions).toHaveLength(1);
    expect(contents()).toEqual([]);
  });
});

describe('onMailing', () => {
  const SENT: SentContent = { letterBody: '<p>Brief</p><script>x</script>', noticeBlocks: [{ id: 't', type: 'text', html: '<p>Mitteilung</p>' }] };
  const mailing = (over: Partial<MailingDoc> = {}): MailingDoc => ({
    tenants: [T], senderUid: 'admin', senderKey: 'boss', senderName: 'Boss', subject: 'Herbst', body: '<p>Mail</p>',
    layout: 'standard' as never, from: '', to: ['info@club.ch'], cc: [], attachmentName: '', attachments: [],
    deliveries: [{ personKey: 'p1', channels: ['email', 'chat', 'post'] }], createdAt: '20261125100000', state: 'pending', pageKey: PAGE, webVersion: false, ...over,
  });
  type Ref = { collection(n: string): { doc(id: string): { get(): Promise<unknown> } } };
  let reads: number;

  async function run(doc: MailingDoc, readContent?: () => Promise<unknown>): Promise<MailingDoc> {
    store['mailings/m1'] = doc as never;
    const ref = (h.db as { collection(n: string): { doc(id: string): Ref } }).collection('mailings').doc('m1');
    reads = 0;
    const counting = { ...ref, collection: (name: string) => ({ doc: (id: string) => {
      const content = ref.collection(name).doc(id);
      return { ...content, get: async () => { reads++; return readContent ? readContent() : content.get(); } };
    } }) };
    await runOnMailing({ data: { id: 'm1', data: () => doc, ref: counting } });
    return store['mailings/m1'] as unknown as MailingDoc;
  }
  const notices = () => docsOf('notices').map(([, d]) => d);
  const jobs = () => docsOf('mailJobs').map(([, d]) => d as unknown as MailJobDoc);

  it('gives the notice the blocks and the letters their own body, from one read; the mail keeps `body`', async () => {
    store['mailings/m1/content/sent'] = SENT as unknown as Doc;
    const done = await run(mailing());
    expect(done.state).toBe('sent');
    expect(reads).toBe(1);
    expect(jobs()[0].body).toBe('<p>Mail</p>');
    expect(notices()[0]).toMatchObject({ body: '<p style="margin:0 0 16px">Mail</p>', blocks: SENT.noticeBlocks });
    expect(h.letters[0]['body']).toBe('<p style="margin:0 0 16px">Brief</p>');
  });

  it('a Versand without stored content goes out as before', async () => {
    const done = await run(mailing());
    expect(done.state).toBe('sent');
    expect(notices()[0]).not.toHaveProperty('blocks');
    expect(notices()[0]['body']).toBe('<p style="margin:0 0 16px">Mail</p>');
    expect(h.letters[0]['body']).toBe('<p style="margin:0 0 16px">Mail</p>');
  });

  it('reads nothing for a Versand without a page', async () => {
    const done = await run(mailing({ pageKey: undefined }));
    expect(done.state).toBe('sent');
    expect(reads).toBe(0);
  });

  it('sends nothing at all when the content cannot be read, or is not what sendMailing writes', async () => {
    for (const read of [async () => { throw new Error('unavailable'); }, async () => ({ exists: true, data: () => ({ letterBody: 7 }) })]) {
      const done = await run(mailing(), read);
      expect(done.state).toBe('failed');
      expect(done.error).toBeTruthy();
      expect([...jobs(), ...notices(), ...h.letters]).toEqual([]);
    }
  });
});
