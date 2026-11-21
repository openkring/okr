import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  send: vi.fn(async (..._a: unknown[]) => undefined),
  limit: vi.fn(async (..._a: unknown[]) => ({ allowed: true, remaining: 2, retryAfterMs: 0 })),
  logs: [] as string[],
}));

vi.mock('firebase-functions/v2', () => ({
  logger: {
    warn: (m: string) => h.logs.push(m), error: (m: string) => h.logs.push(m), info: (m: string) => h.logs.push(m),
  },
}));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'secret' }),
  projectID: { value: () => 'proj' },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('../calendar/answer-link', async () => {
  const actual = await vi.importActual<typeof import('../calendar/answer-link')>('../calendar/answer-link');
  return { ...actual, invitationLinkSecret: { value: () => 'secret' } };
});
vi.mock('../auth/email-transport', () => ({ sendEmailViaProvider: h.send }));
vi.mock('../auth/email-templates', () => ({ getAppEmailConfig: async () => ({ from: 'Verein <no-reply@x.ch>' }) }));
vi.mock('../email/render-email', () => ({
  renderEmail: async (req: { body: string }) => ({ html: `<div class="layout">${req.body}</div>`, text: '', subject: '' }),
}));
vi.mock('../publicApi/rateLimit', () => ({ checkRateLimit: h.limit }));

import { fakeDb, Store } from '../credit/testing/credit-fake-db';
import { checkNewsletterGroup, createNewsletterSignup, mailboxKey, sendSignupConfirmation, submitNewsletterSignup } from './signup';
import type { NewsletterSignupDoc } from './types';

const T = 'la21';
const ctx = { secret: 'secret', projectId: 'proj' };
const NOW = new Date('2026-11-21T10:00:00Z');

const signup = (over: Partial<NewsletterSignupDoc> = {}): NewsletterSignupDoc => ({
  tenants: [T], groupKey: 'nl1', formKey: 'f1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.ch',
  city: 'Stäfa', createdAt: '20261121110000', expiresAt: '20261128110000', state: 'pending', ...over,
});

let store: Store;
beforeEach(() => {
  h.send.mockClear();
  h.limit.mockClear();
  h.limit.mockImplementation(async () => ({ allowed: true, remaining: 2, retryAfterMs: 0 }));
  h.logs.length = 0;
  store = {
    'groups/nl1': { name: 'Dorfnews', subTitle: 'Neues aus dem Dorf', kind: 'newsletter', isArchived: false, tenants: [T] },
    'groups/plain': { name: 'Gruppe', kind: 'group', isArchived: false, tenants: [T] },
    'groups/old': { name: 'Alt', kind: 'newsletter', isArchived: true, tenants: [T] },
    'groups/other': { name: 'Fremd', kind: 'newsletter', isArchived: false, tenants: ['other'] },
  };
});

describe('createNewsletterSignup', () => {
  it('stores a pending doc with the normalised email, the group and a 7-day expiry', async () => {
    const db = fakeDb(store);
    const key = await createNewsletterSignup(db, {
      tenantId: T, formKey: 'f1', now: NOW,
      values: { groupKey: 'nl1', firstName: ' Anna ', lastName: 'Muster', email: ' Anna@Example.CH ', city: 'Stäfa', extra: 'x' },
    });
    const doc = Object.entries(store).find(([p]) => p === `newsletterSignups/${key}`)?.[1];
    expect(doc).toEqual({
      tenants: [T], groupKey: 'nl1', formKey: 'f1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.ch',
      city: 'Stäfa', createdAt: '20261121110000', expiresAt: '20261128110000', state: 'pending',
    });
  });
});

describe('createNewsletterSignup email shape', () => {
  it.each(['', 'nope', 'a@b', 'a b@c.ch'])('refuses %j', async (email) => {
    await expect(createNewsletterSignup(fakeDb(store), { tenantId: T, formKey: 'f1', now: NOW, values: { groupKey: 'nl1', email } }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('submitNewsletterSignup', () => {
  const implicit = { id: 'g', key: 'groupKey', type: 'implicit', order: 1 };
  const base = (fields: unknown, values: Record<string, unknown>, isSpam = false) => ({
    db: fakeDb(store),
    input: { isSpam, fields: fields as never, tenantId: T, formKey: 'f1', values, now: NOW },
  });
  const signups = () => Object.keys(store).filter((p) => p.startsWith('newsletterSignups/'));
  const ok = { groupKey: 'nl1', email: 'a@b.ch' };

  it('stores the signup with formKey and groupKey for a section-only implicit field', async () => {
    const { db, input } = base([implicit], ok);
    const key = await submitNewsletterSignup(db, input);
    expect(store[`newsletterSignups/${key}`]).toMatchObject({ formKey: 'f1', groupKey: 'nl1', state: 'pending' });
  });
  it('spam stores nothing and returns a random id', async () => {
    const { db, input } = base([implicit], ok, true);
    expect(await submitNewsletterSignup(db, input)).toMatch(/^[0-9a-f-]{36}$/);
    expect(signups()).toHaveLength(0);
  });
  it.each([
    ['no groupKey field', [{ id: 'x', key: 'email', type: 'email' }]],
    ['groupKey is an ordinary field', [{ id: 'g', key: 'groupKey', type: 'text' }]],
    ['implicit with a default value', [{ ...implicit, defaultValue: 'nl1' }]],
  ])('refuses %s as form-closed', async (_n, fields) => {
    const { db, input } = base(fields, ok);
    await expect(submitNewsletterSignup(db, input)).rejects.toMatchObject({ code: 'failed-precondition', message: 'form-closed' });
    expect(signups()).toHaveLength(0);
  });
  it('refuses an empty resolved groupKey', async () => {
    const { db, input } = base([implicit], { groupKey: '', email: 'a@b.ch' });
    await expect(submitNewsletterSignup(db, input)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(signups()).toHaveLength(0);
  });
});

describe('mailboxKey', () => {
  it('folds gmail variants to one mailbox', () => {
    expect(mailboxKey('a.b+x@GMail.com')).toBe(mailboxKey('ab@googlemail.com'));
    expect(mailboxKey('ab@googlemail.com')).toBe('ab@gmail.com');
  });
  it('strips a +tag and keeps dots on other domains', () => {
    expect(mailboxKey('a+x@example.ch')).toBe('a@example.ch');
    expect(mailboxKey('a.b@example.ch')).toBe('a.b@example.ch');
  });
});

describe('sendSignupConfirmation dedupe', () => {
  const at = { ...ctx, now: NOW };
  const run = async (key: string) => sendSignupConfirmation(fakeDb(store), key, store[`newsletterSignups/${key}`] as never, at);

  it('marks the signup mailed, and skips a variant of the same mailbox mailed < 24 h ago', async () => {
    store['newsletterSignups/s1'] = signup({ email: 'a.b@gmail.com' });
    store['newsletterSignups/s2'] = signup({ email: 'ab+x@googlemail.com' });
    await run('s1');
    expect(store['newsletterSignups/s1']).toMatchObject({ mailboxKey: 'ab@gmail.com', mailedAt: '20261121110000' });
    await run('s2');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('sends when the earlier mail was >= 24 h ago', async () => {
    store['newsletterSignups/s1'] = signup({ mailboxKey: 'anna@example.ch', mailedAt: '20261120100000' });
    store['newsletterSignups/s2'] = signup();
    await run('s2');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('sends for a different group of the same mailbox', async () => {
    store['newsletterSignups/s1'] = signup({ mailboxKey: 'anna@example.ch', mailedAt: '20261121100000', groupKey: 'other' });
    store['newsletterSignups/s2'] = signup();
    await run('s2');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('sends when the earlier signup has expired', async () => {
    store['newsletterSignups/s1'] = signup({ mailboxKey: 'anna@example.ch', mailedAt: '20261121100000', expiresAt: '20261121105959' });
    store['newsletterSignups/s2'] = signup();
    await run('s2');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('a failing marker write is logged as such and the mail still counts as sent', async () => {
    store['newsletterSignups/s1'] = signup();
    const db = fakeDb(store);
    const failing = { collection: (n: string) => ({ ...(db.collection(n) as object), doc: (id: string) => ({ ...(db.collection(n).doc(id) as object), update: async () => { throw new Error('x'); } }), where: (db.collection(n) as never as { where: unknown }).where }) } as never;
    await sendSignupConfirmation(failing, 's1', store['newsletterSignups/s1'] as never, at);
    expect(h.send).toHaveBeenCalledTimes(1);
    const logs = h.logs.join('\n');
    expect(logs).toContain('marker write failed');
    expect(logs).not.toContain('failed to send');
  });
});

describe('checkNewsletterGroup', () => {
  it('accepts a live newsletter of the tenant and returns its name and subTitle', async () => {
    expect(await checkNewsletterGroup(fakeDb(store), T, 'nl1')).toEqual({ ok: true, name: 'Dorfnews', subTitle: 'Neues aus dem Dorf' });
  });
  it.each(['plain', 'old', 'other', 'missing', ''])('rejects %s', async (key) => {
    expect(await checkNewsletterGroup(fakeDb(store), T, key)).toEqual({ ok: false });
  });
});

describe('sendSignupConfirmation', () => {
  it('sends one mail whose html carries the signed confirm link', async () => {
    await sendSignupConfirmation(fakeDb(store), 'sig1', signup(), ctx);
    expect(h.send).toHaveBeenCalledTimes(1);
    const [provider, opts] = h.send.mock.calls[0] as [string, { to: string[]; subject: string; html: string }];
    expect(provider).toBe('mailtrap_api');
    expect(opts.to).toEqual(['anna@example.ch']);
    expect(opts.subject).toBe('Bitte bestätige deine Anmeldung zum Newsletter Dorfnews');
    expect(opts.html).toContain('https://europe-west6-proj.cloudfunctions.net/newsletterConfirm?s=sig1&amp;h=');
    expect(opts.html).toContain('Anmeldung bestätigen');
    expect(opts.html).toContain('Neues aus dem Dorf');
  });

  it.each(['plain', 'old', 'other'])('sends nothing for group %s and logs no address', async (groupKey) => {
    await sendSignupConfirmation(fakeDb(store), 'sig1', signup({ groupKey }), ctx);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.logs.join('\n')).not.toContain('anna@example.ch');
  });

  it('sends nothing when the link secret is empty', async () => {
    await sendSignupConfirmation(fakeDb(store), 'sig1', signup(), { ...ctx, secret: '' });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('keys the limit on a hash, never the clear address', async () => {
    await sendSignupConfirmation(fakeDb(store), 'sig1', signup(), ctx);
    const key = h.limit.mock.calls[0][1] as string;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sends no mail once the daily address limit is reached (the fourth signup)', async () => {
    let n = 0;
    h.limit.mockImplementation(async () => (++n <= 3 ? { allowed: true, remaining: 0, retryAfterMs: 0 } : { allowed: false, remaining: 0, retryAfterMs: 1 }));
    for (let i = 0; i < 4; i++) await sendSignupConfirmation(fakeDb(store), `sig${i}`, signup(), ctx);
    expect(h.send).toHaveBeenCalledTimes(3);
    expect(h.logs.join('\n')).not.toContain('anna@example.ch');
  });

  it('does not throw when the provider fails', async () => {
    h.send.mockRejectedValueOnce(new Error('boom anna@example.ch'));
    await expect(sendSignupConfirmation(fakeDb(store), 'sig1', signup(), ctx)).resolves.toBeUndefined();
    expect(h.logs.join('\n')).not.toContain('anna@example.ch');
  });
});
