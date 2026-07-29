import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildSubjectCtx, isRateLimited } from './export-my-data';

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

describe('isRateLimited', () => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.parse('2026-07-28T12:00:00.000Z');

  it('allows the first export ever (no prior artifact, newest = 0)', () => {
    expect(isRateLimited(0, now)).toBe(false);
  });

  it('blocks a second export inside the same hour', () => {
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
