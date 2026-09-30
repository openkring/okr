import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildSubjectCtx, isRateLimited, loadFavEmailIfSynthetic } from './export-my-data';

const dirGet = vi.hoisted(() => vi.fn());
const dirDoc = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: (name: string) => ({ doc: (id: string) => { dirDoc(name, id); return { get: dirGet }; } }) }),
}));

describe('loadFavEmailIfSynthetic', () => {
  it('reads address-directory/{tenant}_person.{personKey} for a synthetic login', async () => {
    dirGet.mockResolvedValueOnce({ data: () => ({ favEmail: 'anna@gmail.com' }) });
    const r = await loadFavEmailIfSynthetic({ personKey: 'p1', tenants: ['scs'], loginEmail: 'max@login.seeclub.org' });
    expect(r).toBe('anna@gmail.com');
    expect(dirDoc).toHaveBeenCalledWith('address-directory', 'scs_person.p1');
  });

  it('does not read anything for a real login email', async () => {
    dirDoc.mockClear();
    expect(await loadFavEmailIfSynthetic({ personKey: 'p1', tenants: ['scs'], loginEmail: 'a@b.ch' })).toBeUndefined();
    expect(dirDoc).not.toHaveBeenCalled();
  });
});

describe('buildSubjectCtx', () => {
  it('derives the ctx from the caller\'s OWN user doc — no subject can be named by a parameter', () => {
    const ctx = buildSubjectCtx('uid1', {
      personKey: 'p1',
      tenants: ['scs'],
      loginEmail: 'Ann.Mueller@Example.com',
    });
    expect(ctx).toEqual({
      uid: 'uid1',
      personKey: 'p1',
      parentKey: 'person.p1',
      tenantId: 'scs',
      email: 'ann.mueller@example.com',
    });
  });

  it('lowercases the email', () => {
    const ctx = buildSubjectCtx('uid1', { personKey: 'p1', tenants: ['scs'], loginEmail: 'ANN@SCS.CH' });
    expect(ctx.email).toBe('ann@scs.ch');
  });

  it('uses the favourite email for a synthetic Benutzername account', () => {
    const user = { personKey: 'p1', tenants: ['scs'], loginEmail: 'max_mueller@login.seeclub.org' };
    expect(buildSubjectCtx('uid1', user, 'Anna@Gmail.com').email).toBe('anna@gmail.com');
    expect(buildSubjectCtx('uid1', user).email).toBe('');
  });

  it('ignores the favourite email for a real login address', () => {
    expect(buildSubjectCtx('uid1', { personKey: 'p1', tenants: ['scs'], loginEmail: 'a@b.ch' }, 'x@y.ch').email).toBe('a@b.ch');
  });

  it('throws failed-precondition when the user has no personKey', () => {
    expect(() => buildSubjectCtx('uid1', { personKey: '', tenants: ['scs'] }))
      .toThrow(HttpsError);
  });

  it('throws failed-precondition when the user has no tenant', () => {
    expect(() => buildSubjectCtx('uid1', { personKey: 'p1', tenants: [] }))
      .toThrow(HttpsError);
  });

  it('throws failed-precondition when userData is entirely undefined', () => {
    expect(() => buildSubjectCtx('uid1', undefined)).toThrow(HttpsError);
  });

  it('takes only the first tenant — a user has always exactly one (UserModel contract)', () => {
    const ctx = buildSubjectCtx('uid1', { personKey: 'p1', tenants: ['scs', 'other'] });
    expect(ctx.tenantId).toBe('scs');
  });
});

// True = the newest artifact is still inside the cooldown, so the callable re-signs THAT
// artifact instead of building a new one (the member never sees an error for retrying).
describe('isRateLimited', () => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.parse('2026-07-28T12:00:00.000Z');

  it('builds a fresh export when there is no prior artifact (newest = 0)', () => {
    expect(isRateLimited(0, now)).toBe(false);
  });

  it('reuses the artifact when a second export is requested inside the same hour', () => {
    const newest = now - 5 * 60 * 1000; // 5 min ago
    expect(isRateLimited(newest, now, ONE_HOUR)).toBe(true);
  });

  it('allows an export exactly at the cooldown boundary', () => {
    const newest = now - ONE_HOUR;
    expect(isRateLimited(newest, now, ONE_HOUR)).toBe(false);
  });

  it('allows an export once the cooldown has fully elapsed', () => {
    const newest = now - ONE_HOUR - 1;
    expect(isRateLimited(newest, now, ONE_HOUR)).toBe(false);
  });

  it('treats a non-finite/negative newest timestamp as "no prior export"', () => {
    expect(isRateLimited(Number.NaN, now)).toBe(false);
    expect(isRateLimited(-1, now)).toBe(false);
  });
});
