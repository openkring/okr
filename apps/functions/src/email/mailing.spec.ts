import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  secret: 'secret',
  letters: [] as Record<string, unknown>[],
  pushes: [] as string[][],
  /** when set, `renderMailPage` (mail-page/mail-page.ts) runs this instead of reading Firestore */
  renderMailPage: undefined as undefined | (() => Promise<{ html: string; page: MailPageModel }>),
}));

vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('firebase-functions/v2/https', async () => {
  const actual = await vi.importActual<typeof import('firebase-functions/v2/https')>('firebase-functions/v2/https');
  return { ...actual, onCall: (_o: unknown, fn: unknown) => fn, onRequest: (_o: unknown, fn: unknown) => fn };
});
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => h.secret }),
  projectID: { value: () => 'proj' },
}));
vi.mock('firebase-admin/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase-admin/firestore')>('firebase-admin/firestore');
  return { ...actual, getFirestore: () => h.db };
});
vi.mock('@okr/shared-util-functions', async () => {
  const actual = await vi.importActual<typeof import('@okr/shared-util-functions')>('@okr/shared-util-functions');
  return { ...actual, checkAppCheckToken: () => undefined, checkAuthentication: () => undefined };
});
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({ file: () => ({ save: async () => undefined }), deleteFiles: async () => undefined }),
}));
vi.mock('../auth/email-templates', async () => {
  const actual = await vi.importActual<typeof import('../auth/email-templates')>('../auth/email-templates');
  return { ...actual, getAppEmailConfig: async () => ({ from: 'Verein <no-reply@x.ch>', senderDomain: 'x.ch' }) };
});
vi.mock('../srv/push', async () => {
  const actual = await vi.importActual<typeof import('../srv/push')>('../srv/push');
  return { ...actual, pushToPersons: async (keys: string[]) => { h.pushes.push(keys); return { sent: keys.length }; } };
});
vi.mock('./mailing-letters', async () => {
  const actual = await vi.importActual<typeof import('./mailing-letters')>('./mailing-letters');
  return {
    ...actual,
    buildMailingLetters: async (args: Record<string, unknown>) => { h.letters.push(args); return { storagePath: 'x.pdf', letters: 1, missing: 0 }; },
  };
});

vi.mock('./mail-page/mail-page', async () => {
  const actual = await vi.importActual<typeof import('./mail-page/mail-page')>('./mail-page/mail-page');
  return {
    ...actual,
    renderMailPage: (...args: Parameters<typeof actual.renderMailPage>) => h.renderMailPage ? h.renderMailPage() : actual.renderMailPage(...args),
  };
});

import { HttpsError } from 'firebase-functions/v2/https';
import { MailPageModel } from '@okr/shared-models';
import { fakeDb, type Store } from '../credit/testing/credit-fake-db';
import { MailPageError } from './mail-page/render-mail-page.logic';
import { verifyNewsletterUnsubscribe } from '../newsletter/newsletter-link';
import type { MailJobDoc } from './mail-job';
import { isTenantDocumentPath, keysFor, mailPageContent, type MailingDoc, noticeExcerpt, onMailing, parseDeliveries, privateRefs, safeFilename, sendMailing } from './mailing';
import { unsubscribeHeaders } from './personal-mail.logic';

describe('mailPageContent', () => {
  async function refusal(): Promise<unknown> {
    try {
      await mailPageContent('t1', 'pk1', 'uid1');
      return undefined;
    } catch (e) {
      return e;
    }
  }

  it('returns the rendered page', async () => {
    const rendered = { html: '<p>Hallo</p>', page: new MailPageModel('t1') };
    h.renderMailPage = async () => rendered;
    expect(await mailPageContent('t1', 'pk1', 'uid1')).toBe(rendered);
    h.renderMailPage = undefined;
  });

  it('turns a MailPageError into failed-precondition with its code', async () => {
    h.renderMailPage = async () => { throw new MailPageError('leer', 'no-content'); };
    const err = await refusal();
    h.renderMailPage = undefined;
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe('failed-precondition');
    expect((err as HttpsError).message).toBe('no-content');
    expect((err as HttpsError).details).toBeUndefined();
  });

  it('names the block at fault in the details', async () => {
    h.renderMailPage = async () => { throw new MailPageError('kaputt', 'invalid-block', 'b1'); };
    const err = await refusal();
    h.renderMailPage = undefined;
    expect(err).toMatchObject({ code: 'failed-precondition', message: 'invalid-block', details: { blockId: 'b1' } });
  });

  it('turns any other error into internal, without its message', async () => {
    h.renderMailPage = async () => { throw new Error('Firestore exploded at mailPages/pk1'); };
    const err = await refusal();
    h.renderMailPage = undefined;
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe('internal');
    expect((err as HttpsError).message).not.toContain('Firestore');
  });
});

describe('parseDeliveries', () => {
  it('keeps each person once with the sendable channels in a fixed order', () => {
    expect(parseDeliveries([
      { personKey: 'a', channels: ['chat', 'email'] },
      { personKey: 'a', channels: ['email'] },
      { personKey: 'b', channels: ['post', 'signal'] },
      { personKey: 'c', channels: ['signal'] },
    ])).toEqual([{ personKey: 'a', channels: ['email', 'chat'] }, { personKey: 'b', channels: ['post'] }]);
  });

  it('refuses anything that is not the expected shape', () => {
    expect(() => parseDeliveries('x')).toThrow();
    expect(() => parseDeliveries([{ personKey: '', channels: [] }])).toThrow();
    expect(() => parseDeliveries([{ personKey: 'a' }])).toThrow();
  });
});

describe('keysFor', () => {
  it('lists the persons ticked for one channel', () => {
    const d = [{ personKey: 'a', channels: ['email', 'chat'] }, { personKey: 'b', channels: ['chat'] }];
    expect(keysFor(d, 'email')).toEqual(['a']);
    expect(keysFor(d, 'chat')).toEqual(['a', 'b']);
  });
});

describe('safeFilename', () => {
  it('drops the path and control characters', () => {
    expect(safeFilename('../../etc/pass\u0000wd.pdf')).toBe('passwd.pdf');
    expect(safeFilename('C:\\Users\\x\\Einladung GV.pdf')).toBe('Einladung GV.pdf');
  });

  it('never returns an empty name and caps the length', () => {
    expect(safeFilename('  ')).toBe('attachment');
    expect(safeFilename('a'.repeat(300))).toHaveLength(120);
  });
});

describe('noticeExcerpt', () => {
  it('turns the body into one short line', () => {
    expect(noticeExcerpt('<p>Liebe Mitglieder</p><p>bis bald</p>')).toBe('Liebe Mitglieder bis bald');
    expect(noticeExcerpt(`<p>${'x'.repeat(200)}</p>`, 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('privateRefs', () => {
  it('references the stored files instead of copying their content', () => {
    expect(privateRefs([{ filename: 'a.pdf', storagePath: 'mailings/scs/m1/0-a.pdf', contentType: 'application/pdf' }]))
      .toEqual([{ privatePath: 'mailings/scs/m1/0-a.pdf', filename: 'a.pdf', contentType: 'application/pdf' }]);
  });
});

describe('isTenantDocumentPath', () => {
  it('accepts the tenant\'s own generated documents', () => {
    expect(isTenantDocumentPath('generated-docs/scs/uid1/g1.pdf', 'scs')).toBe(true);
    expect(isTenantDocumentPath('generated-docs-ephemeral/scs/g1.pdf', 'scs')).toBe(true);
  });

  it('refuses another tenant\'s documents, traversal and other prefixes', () => {
    expect(isTenantDocumentPath('generated-docs/kwa/uid1/g1.pdf', 'scs')).toBe(false);
    expect(isTenantDocumentPath('generated-docs/scs/../kwa/g1.pdf', 'scs')).toBe(false);
    expect(isTenantDocumentPath('generated-docs/scsx/g1.pdf', 'scs')).toBe(false);
    expect(isTenantDocumentPath('tenant/scs/logo.png', 'scs')).toBe(false);
    expect(isTenantDocumentPath('generated-docs/scs/g1.pdf', '')).toBe(false);
  });
});

// ---- newsletter sends (spec 1.169 §5.4 / §5.6) ---------------------------------------------------------------

const T = 'scs';
const NL = 'nl1';
type Run<Req, Res> = (req: Req) => Promise<Res>;
const callSend = sendMailing as unknown as Run<{ data: Record<string, unknown>; auth: { uid: string } }, { mailingKey: string }>;
const runOnMailing = onMailing as unknown as Run<{ data: { id: string; data(): unknown; ref: { update(d: object): Promise<unknown> } } }, void>;

function newsletterStore(): Store {
  const store: Store = {
    'users/admin': { roles: { privileged: true }, tenants: [T], personKey: 'boss', displayName: 'Boss' },
    'users/nladmin': { roles: { registered: true }, tenants: [T], personKey: 'pa' },
    'users/stranger': { roles: { registered: true }, tenants: [T], personKey: 'px' },
    [`groups/${NL}`]: { kind: 'newsletter', tenants: [T], name: 'Newsletter', admins: [{ key: 'pa' }], adminKeys: ['pa'] },
    'groups/g1': { kind: 'group', tenants: [T], name: 'Ruderer', admins: [{ key: 'pa' }] },
    [`address-directory/${T}_org.${T}`]: { favEmail: 'info@club.ch' },
  };
  const sub = (key: string, personKey: string, over: Record<string, unknown> = {}) => {
    store[`newsletterSubscriptions/${key}`] = { tenants: [T], groupKey: NL, personKey, dateOfExit: '', isArchived: false, ...over };
  };
  sub('s1', 'p1');
  sub('s2', 'p2');
  sub('s3', 'p3', { dateOfExit: '20261101' });        // ended
  sub('s4', 'p4', { isArchived: true });              // archived
  sub('s5', 'p5', { tenants: ['other'] });            // another tenant's
  for (const k of ['p1', 'p2']) store[`address-directory/${T}_person.${k}`] = { favEmail: `${k}@x.ch` };
  return store;
}

const request = (uid: string, data: Record<string, unknown>) => ({
  auth: { uid },
  data: { tenantId: T, subject: 'Herbst', body: '<p>Hallo</p>', to: ['info@club.ch'], ...data },
});
const email = (...keys: string[]) => keys.map((personKey) => ({ personKey, channels: ['email'] }));

describe('sendMailing to a newsletter group', () => {
  let store: Store;
  beforeEach(() => {
    store = newsletterStore();
    h.db = fakeDb(store);
  });
  const mailings = () => Object.entries(store).filter(([p]) => p.startsWith('mailings/')).map(([, d]) => d as unknown as MailingDoc);

  it('refuses a recipient without an active subscription, also for an elevated caller', async () => {
    for (const personKey of ['p3', 'p4', 'p5', 'nobody']) {
      await expect(callSend(request('admin', { groupKey: NL, deliveries: email('p1', personKey) })))
        .rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect(mailings()).toHaveLength(0);
  });

  it('stamps newsletterGroupKey on the mailings doc, and ignores one the client sent', async () => {
    await callSend(request('admin', { groupKey: NL, deliveries: email('p1', 'p2'), newsletterGroupKey: 'forged' }));
    expect(mailings()).toHaveLength(1);
    expect(mailings()[0].newsletterGroupKey).toBe(NL);
  });

  it('ignores a client-sent newsletterGroupKey on an ordinary Versand', async () => {
    await callSend(request('admin', { deliveries: email('p1'), newsletterGroupKey: NL }));
    expect(mailings()[0]).not.toHaveProperty('newsletterGroupKey');
  });

  it('accepts the newsletter group admin for subscribers, without any membership, under the tenant sender', async () => {
    await callSend(request('nladmin', { groupKey: NL, deliveries: email('p1', 'p2'), from: 'Anna <anna@x.ch>' }));
    expect(mailings()[0]).toMatchObject({ newsletterGroupKey: NL, from: '' });
  });

  it('refuses Post, answer links and a tenant document from the newsletter group admin', async () => {
    await expect(callSend(request('nladmin', { groupKey: NL, deliveries: [{ personKey: 'p1', channels: ['email', 'post'] }] })))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'A group admin cannot send by post.' });
    await expect(callSend(request('nladmin', { groupKey: NL, deliveries: email('p1'), caleventKeys: ['e1'] })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callSend(request('nladmin', { groupKey: NL, deliveries: email('p1'), storagePath: `generated-docs/${T}/u/a.pdf` })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mailings()).toHaveLength(0);
  });

  it('refuses a caller who is no admin of the newsletter, and To/Cc outside the club and the subscribers', async () => {
    await expect(callSend(request('stranger', { groupKey: NL, deliveries: email('p1') }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callSend(request('nladmin', { groupKey: NL, deliveries: email('p1'), to: ['evil@else.ch'] })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await callSend(request('nladmin', { groupKey: NL, deliveries: email('p1'), to: ['p2@x.ch'] }));
    expect(mailings()).toHaveLength(1);
  });

  it('refuses a Cc on a newsletter send instead of dropping it, also for an elevated caller', async () => {
    for (const uid of ['admin', 'nladmin']) {
      await expect(callSend(request(uid, { groupKey: NL, deliveries: email('p1'), cc: ['p2@x.ch'] })))
        .rejects.toMatchObject({ code: 'invalid-argument' });
    }
    expect(mailings()).toHaveLength(0);
    await callSend(request('admin', { groupKey: NL, deliveries: email('p1'), cc: [] }));
    expect(mailings()[0]).toMatchObject({ newsletterGroupKey: NL, cc: [] });
  });

  it('refuses an archived newsletter or another tenant\'s instead of sending it the ordinary way', async () => {
    store[`groups/${NL}`] = { ...store[`groups/${NL}`], isArchived: true };
    await expect(callSend(request('admin', { groupKey: NL, deliveries: email('p1') })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    store[`groups/${NL}`] = { ...store[`groups/${NL}`], isArchived: false, tenants: ['other'] };
    await expect(callSend(request('admin', { groupKey: NL, deliveries: email('p1') })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mailings()).toHaveLength(0);
  });

  it('leaves an ordinary group as it was: the admin needs members there', async () => {
    await expect(callSend(request('nladmin', { groupKey: 'g1', deliveries: email('p1') })))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'Every recipient must be a member of the group.' });
  });
});

describe('onMailing for a newsletter send', () => {
  let store: Store;
  beforeEach(() => {
    store = newsletterStore();
    h.db = fakeDb(store);
    h.secret = 'secret';
    h.letters = [];
    h.pushes = [];
  });

  const mailing = (over: Partial<MailingDoc> = {}): MailingDoc => ({
    tenants: [T], senderUid: 'admin', senderKey: 'boss', senderName: 'Boss', subject: 'Herbst', body: '<p>Hallo</p>',
    layout: 'standard' as never, from: '', to: ['info@club.ch'], cc: [], attachmentName: '', attachments: [],
    deliveries: email('p1', 'p2'), createdAt: '20261121100000', state: 'pending', newsletterGroupKey: NL, ...over,
  });
  async function run(doc: MailingDoc, id = 'm1'): Promise<MailingDoc> {
    store[`mailings/${id}`] = doc as never;
    const ref = (h.db as { collection(n: string): { doc(id: string): { update(d: object): Promise<unknown> } } }).collection('mailings').doc(id);
    await runOnMailing({ data: { id, data: () => doc, ref } });
    return store[`mailings/${id}`] as unknown as MailingDoc;
  }
  const jobs = () => Object.entries(store).filter(([p]) => p.startsWith('mailJobs/')).map(([, d]) => d as unknown as MailJobDoc);
  const unsubscribeOf = (url: string | undefined) => {
    const u = new URL(url ?? '');
    return { p: u.searchParams.get('p') ?? '', g: u.searchParams.get('g') ?? '', h: u.searchParams.get('h') ?? '' };
  };

  it('sends every E-Mail the personal way without events, each with its own unsubscribe link and headers', async () => {
    const done = await run(mailing());
    expect(done.state).toBe('sent');
    expect(jobs()).toHaveLength(1);
    const [job] = jobs();
    expect(job.blocks).toEqual(['unsubscribe']);
    expect(job).not.toHaveProperty('bcc');
    expect(job).not.toHaveProperty('cc');
    expect(job.personal?.map((e) => e.to)).toEqual(['p1@x.ch', 'p2@x.ch']);
    for (const [i, entry] of (job.personal ?? []).entries()) {
      const link = unsubscribeOf(entry.unsubscribeUrl);
      expect(entry.unsubscribeUrl).toMatch(/^https:\/\/europe-west6-proj\.cloudfunctions\.net\/newsletterUnsubscribe\?/);
      expect(link).toMatchObject({ p: `p${i + 1}`, g: NL });
      expect(verifyNewsletterUnsubscribe(link.p, link.g, link.h, 'secret')).toBe(true);
      expect(entry.headers).toEqual(unsubscribeHeaders(entry.unsubscribeUrl ?? ''));
      expect(entry).not.toHaveProperty('answerUrl');
    }
    expect(done).toMatchObject({ emails: 2, mailJobKey: done.mailJobKeys?.[0] });
  });

  it('appends both blocks when the newsletter asks about events', async () => {
    store['calevents/e1'] = { name: 'GV', startDate: '20261210', startTime: '19:00' };
    await run(mailing({ caleventKeys: ['e1'] }));
    const [job] = jobs();
    expect(job.blocks).toEqual(['answer', 'unsubscribe']);
    expect(job.answerEvents?.[0].name).toBe('GV');
    expect(job.personal?.every((e) => !!e.answerUrl && !!e.unsubscribeUrl)).toBe(true);
  });

  it('splits 1 700 recipients into 3 mail jobs of at most 800', async () => {
    const keys = Array.from({ length: 1700 }, (_, i) => `q${i}`);
    for (const k of keys) store[`address-directory/${T}_person.${k}`] = { favEmail: `${k}@x.ch` };
    const done = await run(mailing({ deliveries: email(...keys) }));
    expect(jobs().map((j) => j.personal?.length)).toEqual([800, 800, 100]);
    expect(done.mailJobKeys).toHaveLength(3);
    expect(done.emails).toBe(1700);
    expect(new Set(jobs().flatMap((j) => j.personal?.map((e) => e.unsubscribeUrl))).size).toBe(1700);
  });

  it('keeps an ordinary Versand on one Bcc job', async () => {
    await run(mailing({ newsletterGroupKey: undefined }));
    expect(jobs()).toHaveLength(1);
    expect(jobs()[0]).toMatchObject({ bcc: ['p1@x.ch', 'p2@x.ch'] });
    expect(jobs()[0]).not.toHaveProperty('personal');
  });

  it('fails the newsletter send and sends nothing when the link secret is empty', async () => {
    h.secret = '';
    store['users/u1'] = { personKey: 'p1', tenants: [T] };
    const done = await run(mailing({ deliveries: [{ personKey: 'p1', channels: ['email', 'chat', 'post'] }] }));
    expect(done.state).toBe('failed');
    expect(jobs()).toHaveLength(0);
    expect(Object.keys(store).some((p) => p.startsWith('notices/'))).toBe(false);
    expect(h.letters).toHaveLength(0);
  });

  it('gives the notice the newsletter group and the letters each person\'s unsubscribe link', async () => {
    store['users/u1'] = { personKey: 'p1', tenants: [T] };
    await run(mailing({ deliveries: [{ personKey: 'p1', channels: ['chat'] }, { personKey: 'p2', channels: ['post'] }] }));
    const notice = Object.entries(store).find(([p]) => p.startsWith('notices/'))?.[1];
    expect(notice).toMatchObject({ newsletterGroupKey: NL, recipients: ['p1'] });
    expect(h.letters).toHaveLength(1);
    const urlOf = h.letters[0]['unsubscribeUrl'] as (k: string) => string;
    expect(unsubscribeOf(urlOf('p2'))).toMatchObject({ p: 'p2', g: NL });
  });

  it('gives an ordinary notice an empty newsletterGroupKey and its letters no unsubscribe link', async () => {
    store['users/u1'] = { personKey: 'p1', tenants: [T] };
    await run(mailing({ newsletterGroupKey: undefined, deliveries: [{ personKey: 'p1', channels: ['chat'] }, { personKey: 'p2', channels: ['post'] }] }));
    const notice = Object.entries(store).find(([p]) => p.startsWith('notices/'))?.[1];
    expect(notice).toMatchObject({ newsletterGroupKey: '' });
    expect(h.letters[0]).not.toHaveProperty('unsubscribeUrl');
  });
});
