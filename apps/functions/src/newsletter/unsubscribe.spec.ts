import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: undefined as unknown, secret: 'test-secret' }));

vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_o: unknown, h: unknown) => h,
  onCall: (_o: unknown, h: unknown) => h,
  HttpsError: class HttpsError extends Error { constructor(public code: string, m: string) { super(m); } },
}));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => state.db }));
vi.mock('@okr/shared-util-functions', () => ({ checkAppCheckToken: vi.fn(), checkAuthentication: vi.fn() }));
vi.mock('../calendar/answer-link', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../calendar/answer-link')>()),
  invitationLinkSecret: { value: () => state.secret },
}));
vi.mock('../calendar/deliver', () => ({
  tenantLinks: vi.fn(async () => ({ appName: 'Dorfverein', appUrl: '', brandColor: '', logoUrl: '' })),
  brandOf: (l: { appName: string }) => ({ appName: l.appName }),
  NO_TENANT_LINKS: { appName: '', appUrl: '', brandColor: '', logoUrl: '' },
}));
vi.mock('../email/mailing-answer', () => ({ pageFrame: vi.fn(async () => undefined) }));

import { fakeDb, Store } from '../credit/testing/credit-fake-db';
import { sign } from '../calendar/answer-link';
import { hasOtherTenantLink, releasePersonIfUnlinked, TENANT_LINK_SOURCES, TenantLinkSource } from './tenant-link';
import { endSubscription, leaveNewsletter, newsletterUnsubscribe } from './unsubscribe';

const T = 'la21';
const P = 'p1';
const G = 'nl1';
const TODAY = '20261121';
const sig = (personKey = P, groupKey = G) => sign(personKey, groupKey, 'newsletter-unsubscribe', 'test-secret');

let store: Store;
beforeEach(() => {
  state.secret = 'test-secret';
  store = {
    'groups/nl1': { name: 'Dorfnews', kind: 'newsletter', tenants: [T], admins: [{ key: 'gadm' }], adminKeys: ['gadm'] },
    'persons/p1': { firstName: 'Anna', lastName: 'Muster', tenants: [T], isArchived: false },
    'addresses/a1': { parentKey: 'person.p1', addressChannel: 'email', email: 'anna@example.ch', tenants: [T], isArchived: false },
    'addresses/a2': { parentKey: 'person.p1', addressChannel: 'postal', city: 'Stäfa', tenants: [T], isArchived: false },
    'newsletterSubscriptions/s1': { personKey: P, groupKey: G, groupName: 'Dorfnews', tenants: [T], dateOfEntry: '20261101', dateOfExit: '', isArchived: false },
  };
  state.db = fakeDb(store);
});

type Res = { statusCode: number; body: string; headers: Record<string, string>; headersSent: boolean };
async function call(method: string, query: Record<string, string>, body?: unknown): Promise<Res> {
  const res = {
    statusCode: 200, body: '', headers: {} as Record<string, string>, headersSent: false,
    set(k: string, v: string) { this.headers[k] = v; return this; },
    status(c: number) { this.statusCode = c; return this; },
    send(b: string) { this.body = b; this.headersSent = true; return this; },
  };
  await (newsletterUnsubscribe as unknown as (req: unknown, res: unknown) => Promise<void>)({ method, query, body }, res);
  return res;
}
const snapshot = () => JSON.stringify(store);

describe('newsletterUnsubscribe', () => {
  it('GET with a valid signature writes nothing and shows a POST form', async () => {
    const before = snapshot();
    const res = await call('GET', { p: P, g: G, h: sig() });
    expect(snapshot()).toBe(before);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<form method="post">');
    expect(res.body).toContain('Abmelden');
    expect(res.body).toContain('Möchtest du den Newsletter Dorfnews abbestellen?');
    expect(res.headers['Content-Security-Policy']).toContain("form-action 'self'");
  });

  it('POST ends the subscription and archives a person whose only link it was', async () => {
    const res = await call('POST', { p: P, g: G, h: sig() });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Du bist abgemeldet.');
    expect(store['newsletterSubscriptions/s1']['dateOfExit']).toMatch(/^\d{8}$/);
    expect(store['persons/p1']).toMatchObject({ isArchived: true, tenants: [T] });
    expect(store['addresses/a1']).toMatchObject({ isArchived: true, tenants: [T] });
    expect(store['addresses/a2']).toMatchObject({ isArchived: true, tenants: [T] });
  });

  it("accepts the mail client's one-click POST (RFC 8058)", async () => {
    const res = await call('POST', { p: P, g: G, h: sig() }, { 'List-Unsubscribe': 'One-Click' });
    expect(res.body).toContain('Du bist abgemeldet.');
    expect(store['newsletterSubscriptions/s1']['dateOfExit']).not.toBe('');
  });

  it('a second POST shows the same page and writes nothing', async () => {
    const first = await call('POST', { p: P, g: G, h: sig() });
    const before = snapshot();
    const second = await call('POST', { p: P, g: G, h: sig() });
    expect(snapshot()).toBe(before);
    expect(second.body).toBe(first.body);
  });

  it('GET after the exit says the person is signed off, without a form', async () => {
    await call('POST', { p: P, g: G, h: sig() });
    const res = await call('GET', { p: P, g: G, h: sig() });
    expect(res.body).toContain('Du bist abgemeldet.');
    expect(res.body).not.toContain('<form');
  });

  it('an invalid signature writes nothing, on GET and on POST', async () => {
    const before = snapshot();
    for (const method of ['GET', 'POST']) {
      const res = await call(method, { p: P, g: G, h: 'forged' });
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('Dieser Link ist ungültig.');
    }
    // a signature of another group does not verify for this one
    expect((await call('POST', { p: P, g: G, h: sig(P, 'other') })).statusCode).toBe(403);
    expect(snapshot()).toBe(before);
  });

  it('fails closed without a secret', async () => {
    const before = snapshot();
    state.secret = '';
    const res = await call('POST', { p: P, g: G, h: sig() });
    expect(res.statusCode).toBe(403);
    expect(snapshot()).toBe(before);
  });

  it('refuses other methods', async () => {
    expect((await call('PUT', { p: P, g: G, h: sig() })).statusCode).toBe(405);
  });
});

describe('endSubscription and the only-link rule', () => {
  it('detaches a person shared with another tenant, and only this tenant from the addresses', async () => {
    store['persons/p1']['tenants'] = [T, 't2'];
    store['addresses/a1']['tenants'] = [T, 't2'];
    store['addresses/a3'] = { parentKey: 'person.p1', addressChannel: 'phone', tenants: ['t2'], isArchived: false };
    expect(await endSubscription(state.db as never, T, P, G, TODAY)).toBe('ended');
    expect(store['persons/p1']).toMatchObject({ tenants: ['t2'], isArchived: false });
    expect(store['addresses/a1']).toMatchObject({ tenants: ['t2'], isArchived: false });
    expect(store['addresses/a2']).toMatchObject({ tenants: [T], isArchived: true });
    expect(store['addresses/a3']).toEqual({ parentKey: 'person.p1', addressChannel: 'phone', tenants: ['t2'], isArchived: false });
  });

  it('keeps a person with an active membership in the tenant', async () => {
    store['memberships/m1'] = { memberKey: P, memberModelType: 'person', tenants: [T], dateOfExit: '' };
    expect(await endSubscription(state.db as never, T, P, G, TODAY)).toBe('ended');
    expect(store['newsletterSubscriptions/s1']['dateOfExit']).toBe(TODAY);
    expect(store['persons/p1']['isArchived']).toBe(false);
    expect(store['addresses/a1']['isArchived']).toBe(false);
  });

  it('is notActive and writes nothing for an ended or foreign subscription', async () => {
    store['newsletterSubscriptions/s1']['dateOfExit'] = '20261101';
    const before = snapshot();
    expect(await endSubscription(state.db as never, T, P, G, TODAY)).toBe('notActive');
    expect(await endSubscription(state.db as never, 't2', P, G, TODAY)).toBe('notActive');
    expect(snapshot()).toBe(before);
  });

  it('releasePersonIfUnlinked is safe to run twice', async () => {
    store['newsletterSubscriptions/s1']['dateOfExit'] = TODAY;
    expect(await releasePersonIfUnlinked(state.db as never, T, P)).toBe('archived');
    const before = snapshot();
    expect(await releasePersonIfUnlinked(state.db as never, T, P)).toBe('archived');
    expect(snapshot()).toBe(before);
  });
});

describe('hasOtherTenantLink', () => {
  const linked = () => hasOtherTenantLink(state.db as never, T, P);

  it('is false with only the subscription being ended', async () => {
    store['newsletterSubscriptions/s1']['dateOfExit'] = TODAY;
    expect(await linked()).toBe(false);
  });

  it('counts another active subscription of the tenant', async () => {
    expect(await linked()).toBe(true);
  });

  it('counts memberships by their exit date, and only of this tenant and of a person', async () => {
    store['newsletterSubscriptions/s1']['dateOfExit'] = TODAY;
    store['memberships/m1'] = { memberKey: P, memberModelType: 'person', tenants: [T], dateOfExit: '20200101' };
    store['memberships/m2'] = { memberKey: P, memberModelType: 'person', tenants: ['t2'], dateOfExit: '' };
    store['memberships/m3'] = { memberKey: P, memberModelType: 'org', tenants: [T], dateOfExit: '' };
    expect(await linked()).toBe(false);
    store['memberships/m4'] = { memberKey: P, memberModelType: 'person', tenants: [T], dateOfExit: '99991231' };
    expect(await linked()).toBe(true);
  });

  /** A document that names P in the tenant, built from the source itself, so a typo in the list fails here. */
  function fixture(source: TenantLinkSource): [string, Record<string, unknown>] {
    const doc: Record<string, unknown> = { tenants: [T], dateOfExit: '', isArchived: false };
    const put = (path: string, value: unknown): void => {
      const keys = path.split('.');
      let o = doc;
      for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
      o[keys[keys.length - 1]] = value;
    };
    switch (source.kind) {
      case 'docId': return [`${source.collection}/${P}`, doc];
      case 'scan':
        if (source.bound) put(source.bound.field, source.bound.value);
        put(source.arrays[0], [{ key: P, modelType: 'person' }]);
        return [`${source.collection}/fx`, doc];
      case 'field':
        put(source.field, source.op === 'array-contains' ? [P] : P);
        if (source.extra) put(source.extra.field, source.extra.value);
        return [`${source.collection}/fx`, doc];
    }
  }

  it.each(TENANT_LINK_SOURCES.map((source, i) => [i, source.collection, source] as const))(
    'source %i (%s) counts as a link, and not in another tenant',
    async (_i, _c, source) => {
      store['newsletterSubscriptions/s1']['dateOfExit'] = TODAY;
      const [path, doc] = fixture(source);
      store[path] = doc;
      expect(await linked()).toBe(true);
      store[path] = { ...doc, tenants: ['t2'] };
      expect(await linked()).toBe(false);
    },
  );

  it('counts every array of a scan source (course trainers and responsible persons, transfer subjects and objects)', async () => {
    store['newsletterSubscriptions/s1']['dateOfExit'] = TODAY;
    store['courses/c1'] = { tenants: [T], trainers: [], responsiblePersons: [{ key: P, modelType: 'person' }] };
    expect(await linked()).toBe(true);
    store['courses/c1'] = { tenants: [T], trainers: [{ key: P, modelType: 'org' }] };
    store['transfers/x'] = { tenants: [T], subjects: [], objects: [{ key: P }] };
    expect(await linked()).toBe(true);
  });

  it('ignores records of another tenant and an org with the same key', async () => {
    store['newsletterSubscriptions/s1']['dateOfExit'] = TODAY;
    store['users/u1'] = { personKey: P, tenants: ['t2'] };
    store['invoices/x'] = { receiver: { key: P, modelType: 'org' }, tenants: [T] };
    expect(await linked()).toBe(false);
  });
});

describe('leaveNewsletter', () => {
  const leave = (uid: string, data: unknown) =>
    (leaveNewsletter as unknown as (r: unknown) => Promise<unknown>)({ auth: { uid }, data });

  it('lets the subscriber leave', async () => {
    store['users/u1'] = { personKey: P, tenants: [T], roles: {} };
    await expect(leave('u1', { tenantId: T, subscriptionKey: 's1' })).resolves.toEqual({ ok: true });
    expect(store['newsletterSubscriptions/s1']['dateOfExit']).toMatch(/^\d{8}$/);
    // the subscriber's own login is a link to the tenant: the person and the addresses are kept
    expect(store['persons/p1']['isArchived']).toBe(false);
    expect(store['addresses/a1']['isArchived']).toBe(false);
  });

  it('lets a memberAdmin of the tenant and an admin of the newsletter end it', async () => {
    store['users/ma'] = { personKey: 'ma', tenants: [T], roles: { memberAdmin: true } };
    await expect(leave('ma', { tenantId: T, subscriptionKey: 's1' })).resolves.toEqual({ ok: true });
    store['newsletterSubscriptions/s1']['dateOfExit'] = '';
    store['users/ga'] = { personKey: 'gadm', tenants: [T], roles: {} };
    await expect(leave('ga', { tenantId: T, subscriptionKey: 's1' })).resolves.toEqual({ ok: true });
  });

  it('refuses anybody else, and a memberAdmin of another tenant', async () => {
    store['users/x'] = { personKey: 'x', tenants: [T], roles: {} };
    store['users/y'] = { personKey: 'y', tenants: ['t2'], roles: { memberAdmin: true } };
    const before = snapshot();
    await expect(leave('x', { tenantId: T, subscriptionKey: 's1' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(leave('y', { tenantId: T, subscriptionKey: 's1' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(snapshot()).toBe(before);
  });

  it('answers not-found for a missing or foreign subscription alike', async () => {
    store['users/ma'] = { personKey: 'ma', tenants: ['t2'], roles: { memberAdmin: true } };
    await expect(leave('ma', { tenantId: 't2', subscriptionKey: 'nope' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(leave('ma', { tenantId: 't2', subscriptionKey: 's1' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a request without tenant or subscription', async () => {
    store['users/u1'] = { personKey: P, tenants: [T], roles: {} };
    await expect(leave('u1', { tenantId: T })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
