import { describe, expect, it } from 'vitest';

import { carddavVerdict, hashToken, mintToken, parseBasicAuth } from './dav-auth';

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
