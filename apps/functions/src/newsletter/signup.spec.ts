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
import { checkNewsletterGroup, createNewsletterSignup, sendSignupConfirmation } from './signup';
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
