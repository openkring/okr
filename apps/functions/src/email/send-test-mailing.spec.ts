// The test mail (spec 1.176 §8.4), end to end on an in-memory Firestore: page, layout, sender, attachments. Only the provider,
// the account and the document store are injected.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  logs: [] as unknown[][],
  /** what Firebase Auth has for the caller's uid, and the uids it was asked for */
  account: {} as { email?: string; emailVerified: boolean },
  asked: [] as string[],
  /** what the callable itself sent */
  wired: [] as { to: string[] }[],
}));

vi.mock('firebase-functions/v2', async () => {
  const log = (...args: unknown[]): void => { h.logs.push(args); };
  return { logger: { info: log, error: log, warn: log, debug: log } };
});
vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/firestore')>('firebase-admin/firestore');
  return { ...actual, getFirestore: () => h.db };
});
vi.mock('firebase-admin/auth', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/auth')>('firebase-admin/auth');
  return { ...actual, getAuth: () => ({ getUser: async (uid: string) => { h.asked.push(uid); return h.account; } }) };
});
vi.mock('../auth/email-transport', async () => {
  const actual = await vi.importActual<typeof import('../auth/email-transport')>('../auth/email-transport');
  return { ...actual, sendEmailViaProvider: async (_provider: string, mail: { to: string[] }) => { h.wired.push(mail); } };
});
vi.mock('../_storage/private-bucket', () => ({ privateBucket: () => { throw new Error('the test mail stores nothing'); } }));

import type { EmailOptions } from '../auth/email-transport';
import { fakeDb, type Doc, type Store } from '../credit/testing/credit-fake-db';
import { MAILING_CATEGORY_PREFIX } from './mailing-deliveries.logic';
import { trustedCategory } from './mail-job';
import { runTestMailing, sendTestMailing, type TestMailingDeps } from './send-test-mailing';

const T = 'scs';
const PAGE = 'pg1';
const ADDRESS = 'Anna.Muster@mail.example.org';

let store: Store;
let sent: { provider: string; mail: EmailOptions }[];
let documents: string[];
let sendError: unknown;

const deps = (): TestMailingDeps => ({
  db: h.db as TestMailingDeps['db'],
  account: async (uid) => { h.asked.push(uid); return h.account; },
  send: async (provider, mail) => { if (sendError) throw sendError; sent.push({ provider, mail }); },
  readDocument: async (path) => { documents.push(path); return { content: Buffer.from('pdf'), contentType: 'application/pdf' }; },
});
const run = (data: Record<string, unknown> = {}, uid = 'boss', impersonated = false) =>
  runTestMailing(deps(), { uid, impersonated }, { tenantId: T, pageKey: PAGE, subject: 'Herbst', ...data });
const mail = (): EmailOptions => sent[0].mail;
const page = (over: Doc = {}): Doc => ({ tenants: [T], senderUid: 'boss', type: 'mail', createdAt: '2026-11-25T10:00:00.000Z', sections: ['s1'], ...over });

beforeEach(() => {
  store = {
    'users/boss': { roles: { memberAdmin: true }, tenants: [T], personKey: 'pb', loginEmail: 'stored@evil.example', email: 'stored@evil.example' },
    'users/ga': { roles: { registered: true }, tenants: [T], personKey: 'pa' },
    'groups/g1': { kind: 'group', tenants: [T], admins: [{ key: 'pa' }] },
    'groups/nl': { kind: 'newsletter', tenants: [T], admins: [{ key: 'pa' }] },
    [`app-config/${T}`]: { appName: 'Verein', appDomain: 'app.club.ch', emailDomain: 'club.ch', emailProvider: 'mailtrap_test' },
    'templates/email-layout-plain': { kind: 'emailLayout', tenants: ['system'], currentVersion: 1 },
    'templates/email-layout-plain/versions/1': { html: '<div class="frame">{{{content}}}</div>', text: 'RAHMEN\n{{{content}}}', subject: '', status: 'published' },
    [`mailPages/${PAGE}`]: page(),
    [`mailPages/${PAGE}/sections/s1`]: {
      type: 'article', tenants: [T], title: '', content: { htmlContent: '' },
      properties: { images: [], blocks: [{ id: 't', type: 'text', html: '<p>Liebe Mitglieder</p>' }] },
    },
    'calevents/ours': { tenants: [T], calendars: ['club'], name: 'Fondue', startDate: '20991204', startTime: '1900', isArchived: false },
    'calevents/foreign': { tenants: ['other'], calendars: ['club'], name: 'Fremder Anlass', startDate: '20991204', startTime: '1900', isArchived: false },
  };
  h.db = fakeDb(store);
  h.logs = [];
  sent = [];
  documents = [];
  h.account = { email: ADDRESS, emailVerified: true };
  h.asked = [];
  h.wired = [];
  sendError = undefined;
  for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...args) => { h.logs.push(args); });
});
afterEach(() => vi.restoreAllMocks());

describe('the recipient', () => {
  it('is the address of the caller\'s account, alone', async () => {
    expect(await run()).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(mail().to).toEqual([ADDRESS]);
    for (const field of ['cc', 'bcc', 'replyTo', 'headers']) expect(mail()).not.toHaveProperty(field);
  });

  it('is never named by the request, whatever it carries', async () => {
    const evil = 'evil@else.ch';
    await run({ to: [evil], cc: [evil], bcc: [evil], replyTo: evil, email: evil, recipient: evil, address: evil, uid: 'ga', personal: [{ to: evil }], deliveries: [{ personKey: 'pa', channels: ['email'] }], headers: { Bcc: evil } });
    expect(sent).toHaveLength(1);
    expect(mail().to).toEqual([ADDRESS]);
    expect(JSON.stringify(mail())).not.toContain('else.ch');
  });

  it('is read from the Auth account every time, never from the users doc', async () => {
    h.account = { email: 'auth@mail.example.org', emailVerified: true };
    await run();
    expect(h.asked).toEqual(['boss']);
    expect(mail().to).toEqual(['auth@mail.example.org']);
    h.account = { emailVerified: true };
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition', message: 'no-address' });
    expect(sent).toHaveLength(1);
  });

  it('must be real: a Benutzername account is refused', async () => {
    for (const email of ['max_muster@login.club.ch', 'MAX@LOGIN.seeclub.org', '', ' ']) {
      h.account = { email, emailVerified: true };
      await expect(run(), email).rejects.toMatchObject({ code: 'failed-precondition', message: 'no-address' });
    }
    expect(sent).toHaveLength(0);
  });

  it('must be one well-formed address: nothing that a transport reads as two', async () => {
    for (const email of ['a@x.ch, b@x.ch', 'a@x.ch;b@x.ch', '"A" <a@x.ch>', 'a@x.ch\nBcc: b@x.ch', 'a@x']) {
      h.account = { email, emailVerified: true };
      await expect(run(), email).rejects.toMatchObject({ message: 'no-address' });
    }
    expect(sent).toHaveLength(0);
  });

  it('must be confirmed for a group or newsletter admin, not for an elevated caller', async () => {
    h.account = { email: ADDRESS, emailVerified: false };
    await run();
    store[`mailPages/${PAGE}`] = page({ senderUid: 'ga' });
    for (const groupKey of ['g1', 'nl']) {
      await expect(run({ groupKey }, 'ga')).rejects.toMatchObject({ code: 'failed-precondition', message: 'no-address' });
    }
    expect(sent).toHaveLength(1);
    h.account = { email: ADDRESS, emailVerified: true };
    for (const groupKey of ['g1', 'nl']) await run({ groupKey }, 'ga');
    expect(sent.slice(1).map((s) => s.mail.to)).toEqual([[ADDRESS], [ADDRESS]]);
  });

  it('is in no log, also when the provider fails', async () => {
    await run();
    sendError = Object.assign(new Error(`550 mailbox ${ADDRESS} unavailable`), { responseCode: 550 });
    await expect(run()).rejects.toMatchObject({ code: 'unavailable', message: 'provider' });
    expect(h.logs.length).toBeGreaterThan(0);
    const logged = h.logs.flat().map((v) => (v instanceof Error ? `${v.message}${v.stack}` : JSON.stringify(v))).join('\n');
    expect(logged).not.toContain(ADDRESS);
    expect(logged).not.toContain('mailbox');
    expect(logged).toContain('550');
  });
});

describe('who may send', () => {
  it('refuses a lost role, another tenant and a stranger', async () => {
    store['users/boss'] = { ...store['users/boss'], roles: { registered: true } };
    await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
    store['users/boss'] = { ...store['users/boss'], roles: { admin: true }, tenants: ['other'] };
    await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(run({}, 'nobody')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(sent).toHaveLength(0);
  });

  it('refuses a session an admin opened for somebody else, after the right and before the address', async () => {
    await expect(run({}, 'boss', true)).rejects.toMatchObject({ code: 'failed-precondition', message: 'impersonated' });
    await expect(run({}, 'nobody', true)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.asked).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('refuses a groupKey that is no document id', async () => {
    await expect(run({ groupKey: 'a/b' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('a group admin must be admin of the group named', async () => {
    store[`mailPages/${PAGE}`] = page({ senderUid: 'ga' });
    await expect(run({}, 'ga')).rejects.toMatchObject({ code: 'permission-denied' });
    await run({ groupKey: 'g1' }, 'ga');
    await run({ groupKey: 'nl' }, 'ga');
    expect(sent).toHaveLength(2);
    for (const group of ['groups/g1', 'groups/nl']) store[group] = { ...store[group], admins: [] };
    await expect(run({ groupKey: 'g1' }, 'ga')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(run({ groupKey: 'nl' }, 'ga')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(sent).toHaveLength(2);
  });

  it('sends only the caller\'s own, unsent page of this tenant', async () => {
    for (const [over, message] of [[{ senderUid: 'ga' }, 'foreign'], [{ tenants: ['other'] }, 'foreign'], [{ mailingKey: 'm1' }, 'sent']] as const) {
      store[`mailPages/${PAGE}`] = page(over as Doc);
      await expect(run(), message).rejects.toMatchObject({ code: 'failed-precondition', message });
    }
    await expect(run({ pageKey: 'none' })).rejects.toMatchObject({ code: 'failed-precondition', message: 'not-found' });
    for (const pageKey of [undefined, '', 'a/b', 7]) await expect(run({ pageKey })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(sent).toHaveLength(0);
  });

  it('refuses a block that cannot be rendered, by name', async () => {
    store[`mailPages/${PAGE}/sections/s1`] = { type: 'article', tenants: [T], properties: { images: [], blocks: [{ id: 'm', type: 'map' }] } };
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition', message: 'unknown-block-type', details: { blockId: 'm' } });
    expect(sent).toHaveLength(0);
  });

  it('refuses a request without a tenant or with a subject that is no text', async () => {
    await expect(run({ tenantId: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(run({ subject: { a: 1 } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('the sender', () => {
  it('is the tenant\'s for a group admin, whatever From was sent', async () => {
    store[`mailPages/${PAGE}`] = page({ senderUid: 'ga' });
    await run({ groupKey: 'g1', from: 'Präsidentin <praesidium@club.ch>' }, 'ga');
    await run({ groupKey: 'nl', from: 'praesidium@club.ch' }, 'ga');
    expect(sent.map((s) => s.mail.from)).toEqual(['"Verein" <app@club.ch>', '"Verein" <app@club.ch>']);
  });

  it('is the chosen one of an elevated caller on the tenant\'s domain only', async () => {
    await run({ from: 'Präsidium <praesidium@club.ch>' });
    await run({ from: 'x@else.ch' });
    await run({ from: 5 });
    await run();
    expect(sent.map((s) => s.mail.from)).toEqual(['"Präsidium" <praesidium@club.ch>', ...Array(3).fill('"Verein" <app@club.ch>')]);
    expect(sent[0].provider).toBe('mailtrap_test');
  });
});

describe('the mail', () => {
  it('has the subject with [Test] before it, or [Test] alone', async () => {
    for (const subject of ['  Herbst ', '', '   ', undefined]) await run({ subject });
    expect(sent.map((s) => s.mail.subject)).toEqual(['[Test] Herbst', '[Test]', '[Test]', '[Test]']);
  });

  it('is the page in the layout, with both halves', async () => {
    await run({ layout: 'plain' });
    expect(mail().html).toContain('<div class="frame">');
    expect(mail().html).toContain('Liebe Mitglieder');
    expect(mail().text).toContain('RAHMEN');
    expect(mail().html).not.toMatch(/abmelden|abbestellen|Im Browser/);
  });

  it('shows answer, unsubscribe and web link as samples that lead nowhere', async () => {
    await run({ groupKey: 'nl', caleventKeys: ['ours'] });
    for (const half of [mail().html, mail().text ?? '']) for (const part of ['Fondue', 'An- oder abmelden', 'Newsletter abbestellen', 'Im Browser ansehen']) expect(half).toContain(part);
    expect(new Set([...mail().html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]))).toEqual(new Set(['#']));
    expect(mail().text).not.toMatch(/https?:|#/);
  });

  it('decides the web link as the send does', async () => {
    await run({ webVersion: true });
    await run({ groupKey: 'nl', webVersion: false });
    await run({ webVersion: 'yes' });
    expect(sent.map((s) => s.mail.html.includes('Im Browser ansehen'))).toEqual([true, false, false]);
  });

  it('names no event the send would refuse: another tenant\'s, or a group admin\'s', async () => {
    const refusal = await run({ caleventKeys: ['foreign'] }).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ code: 'invalid-argument' });
    expect(String((refusal as Error).message)).not.toContain('Fremder');
    await expect(run({ groupKey: 'g1', caleventKeys: ['ours'] })).rejects.toMatchObject({ code: 'permission-denied' });
    store[`mailPages/${PAGE}`] = page({ senderUid: 'ga' });
    await expect(run({ groupKey: 'nl', caleventKeys: ['ours'] }, 'ga')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(sent).toHaveLength(0);
  });

  it('reads each event once', async () => {
    const db = fakeDb(store);
    let reads = 0;
    h.db = { ...db, collection: (name: string) => db.collection(name), getAll: (...refs: never[]) => { reads += refs.length; return db.getAll(...refs); } };
    await run({ caleventKeys: ['ours'] });
    expect(mail().html).toContain('Fondue');
    expect(reads).toBe(1);
  });

  it('carries a category of its own, that no Versand has', async () => {
    await run();
    expect(mail().category).toBe('test-mailing');
    expect(String(mail().category).startsWith(MAILING_CATEGORY_PREFIX)).toBe(false);
    expect(await trustedCategory({ category: mail().category }, T, async () => [T])).toBeUndefined();
  });

  it('turns a layout that cannot be used into a refusal', async () => {
    delete store['templates/email-layout-plain'];
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition', message: 'no-layout' });
    expect(sent).toHaveLength(0);
  });
});

describe('the attachments', () => {
  const inline = (size: number, filename = 'a.pdf') => ({ filename, contentBase64: Buffer.alloc(size).toString('base64'), contentType: 'application/pdf' });

  it('are those of the send: the tenant\'s document, then the inline files, named in the mail', async () => {
    await run({ storagePath: `generated-docs/${T}/u/a.pdf`, filename: 'Brief.pdf', extraAttachments: [inline(3, '../../b.pdf')] });
    expect(documents).toEqual([`generated-docs/${T}/u/a.pdf`]);
    expect(mail().attachments?.map((a) => [a.filename, a.content.length, a.contentType])).toEqual([['Brief.pdf', 3, 'application/pdf'], ['b.pdf', 3, 'application/pdf']]);
    expect(mail().html).toContain('Brief.pdf, b.pdf');
  });

  it('are refused by the same path rules', async () => {
    for (const storagePath of [`generated-docs/other/u/a.pdf`, `generated-docs/${T}/../other/a.pdf`, 'tenant/scs/logo.png', `mailings/${T}/m1/0-a.pdf`]) {
      await expect(run({ storagePath }), storagePath).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    store[`mailPages/${PAGE}`] = page({ senderUid: 'ga' });
    await expect(run({ groupKey: 'g1', storagePath: `generated-docs/${T}/u/a.pdf` }, 'ga')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(run({ groupKey: 'nl', storagePath: `generated-docs/${T}/u/a.pdf` }, 'ga')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(documents).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('are refused by the same size', async () => {
    await expect(run({ extraAttachments: [inline(5 * 1024 * 1024), inline(4 * 1024 * 1024)] })).rejects.toMatchObject({ code: 'invalid-argument', message: 'The attachments are too large.' });
    await expect(run({ extraAttachments: [{ filename: 'x' }] })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(sent).toHaveLength(0);
  });
});

describe('a provider that does not answer', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('is given up after 60 seconds', async () => {
    let called: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => { called = resolve; });
    let outcome: unknown;
    const done = runTestMailing({ ...deps(), send: () => { called(); return new Promise(() => undefined); } }, { uid: 'boss', impersonated: false }, { tenantId: T, pageKey: PAGE })
      .catch((e: unknown) => { outcome = e; });
    await asked;
    await vi.advanceTimersByTimeAsync(59_999);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(outcome).toMatchObject({ code: 'unavailable', message: 'provider' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind otherwise', async () => {
    await run();
    expect(vi.getTimerCount()).toBe(0);
    sendError = new Error('down');
    await expect(run()).rejects.toMatchObject({ message: 'provider' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('what stays', () => {
  it('nothing is written, whether the mail is sent, refused or not taken by the provider', async () => {
    const before = structuredClone(store);
    await run({ groupKey: 'nl', caleventKeys: ['ours'], extraAttachments: [{ filename: 'a', contentBase64: 'AA==' }] });
    await run({ pageKey: 'none' }).catch(() => undefined);
    sendError = new Error('down');
    await run().catch(() => undefined);
    expect(sent).toHaveLength(1);
    expect(store).toEqual(before);
  });

  it('a page can be sent as a test again and again', async () => {
    await run();
    await run();
    expect(sent).toHaveLength(2);
  });
});

describe('the callable', () => {
  type Callable = { run(request: unknown): Promise<unknown>; __endpoint: Record<string, unknown> };
  const callable = sendTestMailing as unknown as Callable;

  it('asks for App Check and a login', async () => {
    await expect(callable.run({ data: {}, auth: { uid: 'boss', token: {} } })).rejects.toMatchObject({ code: 'failed-precondition', message: 'App Check verification failed.' });
    await expect(callable.run({ data: {}, app: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(callable.run({ data: {}, app: {}, auth: { uid: 'boss', token: {} } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('sends to the address of the Auth account, not the older one in the token', async () => {
    h.account = { email: 'new@mail.example.org', emailVerified: false };
    const request = { data: { tenantId: T, pageKey: PAGE }, app: {}, auth: { uid: 'boss', token: { email: 'old@mail.example.org' } } };
    expect(await callable.run(request)).toEqual({ sent: true });
    expect(h.asked).toEqual(['boss']);
    expect(h.wired.map((m) => m.to)).toEqual([['new@mail.example.org']]);
  });

  it('knows an impersonated session by its token', async () => {
    const request = { data: { tenantId: T, pageKey: PAGE }, app: {}, auth: { uid: 'boss', token: { email: ADDRESS, impersonatedBy: 'admin' } } };
    await expect(callable.run(request)).rejects.toMatchObject({ code: 'failed-precondition', message: 'impersonated' });
    expect(h.asked).toEqual([]);
    expect(h.wired).toEqual([]);
  });

  it('runs in europe-west6 with 512 MiB, 120 s and the provider\'s secrets', () => {
    expect(callable.__endpoint).toMatchObject({
      region: ['europe-west6'], availableMemoryMb: 512, timeoutSeconds: 120,
      secretEnvironmentVariables: ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'].map((key) => ({ key })),
    });
  });
});
