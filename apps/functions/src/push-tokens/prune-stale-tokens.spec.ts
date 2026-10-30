import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../matrix-simple/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../matrix-simple/shared')>()),
  requireMatrixLocalpart: vi.fn(async () => 'person1'),
}));

import {
  classifySendError,
  groupByUid,
  needsValidation,
  pruneDecision,
  tokenAgeDays,
  PUSH_TOKEN_HARD_MAX_AGE_DAYS,
  PUSH_TOKEN_MAX_AGE_DAYS,
} from './prune-stale-tokens';
import { removeMatrixPushers } from '../matrix-simple/push';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 30, 6, 0);

describe('prune limits', () => {
  it('uses 60 days soft, 270 days hard (FCM inactivity expiry)', () => {
    expect(PUSH_TOKEN_MAX_AGE_DAYS).toBe(60);
    expect(PUSH_TOKEN_HARD_MAX_AGE_DAYS).toBe(270);
  });
});

describe('tokenAgeDays', () => {
  it('counts whole days; a missing updatedAt is infinitely old', () => {
    expect(tokenAgeDays(NOW - 61 * DAY - 1000, NOW)).toBe(61);
    expect(tokenAgeDays(NOW - 59 * DAY, NOW)).toBe(59);
    expect(tokenAgeDays(null, NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('needsValidation', () => {
  it('only between 60 and 270 days', () => {
    expect(needsValidation(59)).toBe(false);
    expect(needsValidation(60)).toBe(true);
    expect(needsValidation(269)).toBe(true);
    expect(needsValidation(270)).toBe(false);
    expect(needsValidation(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('pruneDecision', () => {
  it('keeps a token younger than 60 days, whatever FCM says', () => {
    expect(pruneDecision(59, 'invalid')).toBe('keep');
    expect(pruneDecision(0)).toBe('keep');
  });

  // I1: a native start may not refresh updatedAt (N4), so age alone never deletes before 270 days.
  it('deletes a 61-day-old token only when FCM reports it dead', () => {
    expect(pruneDecision(61, 'invalid')).toBe('delete');
    expect(pruneDecision(61, 'valid')).toBe('keep');
    expect(pruneDecision(61)).toBe('keep');
  });

  it('keeps it when the check failed (network, quota)', () => {
    expect(pruneDecision(200, 'error')).toBe('keep');
  });

  it('deletes at 270 days regardless, also without updatedAt', () => {
    expect(pruneDecision(270, 'valid')).toBe('delete');
    expect(pruneDecision(270)).toBe('delete');
    expect(pruneDecision(Number.POSITIVE_INFINITY)).toBe('delete');
  });
});

describe('classifySendError', () => {
  it('unregistered, invalid and malformed tokens are invalid', () => {
    expect(classifySendError({ code: 'messaging/registration-token-not-registered' })).toBe('invalid');
    expect(classifySendError({ code: 'messaging/invalid-registration-token' })).toBe('invalid');
    expect(classifySendError({ code: 'messaging/invalid-argument' })).toBe('invalid');
  });

  it('anything else is no verdict', () => {
    expect(classifySendError({ code: 'messaging/quota-exceeded' })).toBe('error');
    expect(classifySendError({ code: 'messaging/server-unavailable' })).toBe('error');
    expect(classifySendError(new Error('ECONNRESET'))).toBe('error');
    expect(classifySendError(undefined)).toBe('error');
  });
});

describe('groupByUid', () => {
  // Review Focus 4: one person, two tenant accounts (two users/{uid} docs) — each account's
  // deleted tokens stay under its own uid.
  it('keeps the accounts of a member of several tenants apart', () => {
    const groups = groupByUid([
      { uid: 'scsUid', token: 'phoneOld' },
      { uid: 'kringUid', token: 'laptopOld' },
      { uid: 'kringUid', token: 'tabletOld' },
    ]);
    expect(groups.get('scsUid')).toEqual([{ uid: 'scsUid', token: 'phoneOld' }]);
    expect(groups.get('kringUid')?.map((r) => r.token)).toEqual(['laptopOld', 'tabletOld']);
    expect(groups.size).toBe(2);
  });
});

describe('removeMatrixPushers', () => {
  const calls: { url: string; body?: unknown }[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
        if (url.endsWith('/login')) return new Response(JSON.stringify({ access_token: 'tok' }));
        if (url.endsWith('/_matrix/client/v3/pushers')) {
          return new Response(
            JSON.stringify({
              pushers: [
                { app_id: 'scs', pushkey: 'stale1' },
                { app_id: 'kring', pushkey: 'otherDevice' },
                { app_id: 'kring', pushkey: 'stale1' },
              ],
            })
          );
        }
        return new Response('{}');
      })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('deletes only the listed pushkeys, never another device of the same person', async () => {
    const removed = await removeMatrixPushers('u1', ['stale1', 'notRegistered']);
    expect(removed).toBe(2);
    const deletes = calls.filter((c) => c.url.endsWith('/pushers/set')).map((c) => c.body);
    expect(deletes).toEqual([
      { app_id: 'scs', pushkey: 'stale1', kind: null },
      { app_id: 'kring', pushkey: 'stale1', kind: null },
    ]);
    expect(calls.filter((c) => c.url.endsWith('/login'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.endsWith('/_matrix/client/v3/pushers'))).toHaveLength(1);
  });

  it('does nothing for an empty list', async () => {
    expect(await removeMatrixPushers('u1', [])).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
