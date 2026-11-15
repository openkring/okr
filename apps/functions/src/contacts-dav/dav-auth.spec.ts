import { describe, expect, it } from 'vitest';

import { carddavVerdict, checkCarddavRequest, hashToken, mintToken, parseBasicAuth } from './dav-auth';

const TOKEN = { uid: 'u1', tenantId: 'bka', createdAt: '20261115', lastUsedAt: '20261115' };
const USER = { tenants: ['bka'], roles: { admin: true }, isArchived: false };
const ON = new Set(['contactsDav']);

describe('carddavVerdict', () => {
  it('accepts an active admin of the tenant with the block on', () => {
    expect(carddavVerdict(TOKEN, USER, ON)).toBe(true);
  });

  it.each([
    ['no token', undefined, USER, ON],
    ['no user', TOKEN, undefined, ON],
    ['archived user', TOKEN, { ...USER, isArchived: true }, ON],
    ['tenant removed', TOKEN, { ...USER, tenants: ['scs'] }, ON],
    ['admin role removed', TOKEN, { ...USER, roles: { admin: false, memberAdmin: true } }, ON],
    ['no roles', TOKEN, { tenants: ['bka'] }, ON],
    ['block switched off', TOKEN, USER, new Set(['subject'])],
  ])('rejects: %s', (_label, token, user, features) => {
    expect(carddavVerdict(token as never, user as never, features as Set<string>)).toBe(false);
  });
});

describe('parseBasicAuth', () => {
  const b = (s: string) => `Basic ${Buffer.from(s).toString('base64')}`;
  it('reads user and password', () => {
    expect(parseBasicAuth(b('anna@x.ch:secret'))).toEqual({ user: 'anna@x.ch', password: 'secret' });
  });
  it('keeps a colon inside the password', () => {
    expect(parseBasicAuth(b('a:b:c'))).toEqual({ user: 'a', password: 'b:c' });
  });
  it.each([[undefined], [''], ['Bearer abc'], [b('nocolon')], [b('user:')]])('rejects %s', (h) => {
    expect(parseBasicAuth(h)).toBeUndefined();
  });
});

describe('mintToken and hashToken', () => {
  it('mints 32 Base62 characters', () => {
    const t = mintToken();
    expect(t).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(mintToken()).not.toBe(t);
  });
  it('hashes to 64 hex characters, deterministically', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });
});

describe('checkCarddavRequest', () => {
  // a tiny in-memory Firestore: collection(name).doc(id).get()/update(), collection(name).get()
  function fakeDb(docs: Record<string, Record<string, unknown>>) {
    const reads: string[] = [];
    const snap = (path: string) => ({ exists: path in docs, data: () => docs[path], get: (f: string) => docs[path]?.[f] });
    return {
      reads,
      db: {
        collection: (c: string) => ({
          doc: (id: string) => ({
            get: async () => { reads.push(`${c}/${id}`); return snap(`${c}/${id}`); },
            update: async (patch: Record<string, unknown>) => { docs[`${c}/${id}`] = { ...docs[`${c}/${id}`], ...patch }; },
          }),
          get: async () => ({ docs: [] }),
        }),
      } as never,
    };
  }
  const ON_LOOKUP = async () => new Set(['contactsDav']);
  const auth = (pw: string) => `Basic ${Buffer.from(`anna:${pw}`).toString('base64')}`;
  const seed = (pw: string) => ({
    [`carddavTokens/${hashToken(pw)}`]: { uid: 'u1', tenantId: 'bka', createdAt: '20261115', lastUsedAt: '20261115' },
    'users/u1': { tenants: ['bka'], roles: { admin: true } },
    'app-config/bka': { enabledFeatures: ['contactsDav'] },
  });

  it('stops granting at once when the password doc is deleted', async () => {
    const docs = seed('pw-revoke');
    const { db } = fakeDb(docs);
    expect(await checkCarddavRequest(db, ON_LOOKUP, auth('pw-revoke'), 1_000)).toBeDefined();
    delete docs[`carddavTokens/${hashToken('pw-revoke')}`];
    expect(await checkCarddavRequest(db, ON_LOOKUP, auth('pw-revoke'), 2_000)).toBeUndefined();
  });

  it('does not cache a rejected password', async () => {
    const { db, reads } = fakeDb({});
    await checkCarddavRequest(db, ON_LOOKUP, auth('wrong-1'), 1_000);
    await checkCarddavRequest(db, ON_LOOKUP, auth('wrong-1'), 2_000);
    expect(reads.filter((r) => r.startsWith('carddavTokens/'))).toHaveLength(2);
  });

  it('reuses the user and feature lookups of a granted password for a minute', async () => {
    const { db, reads } = fakeDb(seed('pw-cache'));
    await checkCarddavRequest(db, ON_LOOKUP, auth('pw-cache'), 1_000);
    await checkCarddavRequest(db, ON_LOOKUP, auth('pw-cache'), 30_000);
    expect(reads.filter((r) => r === 'users/u1')).toHaveLength(1);
    await checkCarddavRequest(db, ON_LOOKUP, auth('pw-cache'), 70_000);
    expect(reads.filter((r) => r === 'users/u1')).toHaveLength(2);
  });
});
