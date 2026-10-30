import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../matrix-simple/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../matrix-simple/shared')>()),
  requireMatrixLocalpart: vi.fn(async () => 'person1'),
}));

import { groupStaleTokens, PUSH_TOKEN_MAX_AGE_DAYS } from './prune-stale-tokens';
import { removeMatrixPushers } from '../matrix-simple/push';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 30, 6, 0);

describe('groupStaleTokens', () => {
  it('uses a 60-day window', () => {
    expect(PUSH_TOKEN_MAX_AGE_DAYS).toBe(60);
  });

  it('61 days old is stale, 59 days old is kept', () => {
    const groups = groupStaleTokens(
      [
        { uid: 'u1', docId: 'old', token: 'tOld', updatedAtMs: NOW - 61 * DAY },
        { uid: 'u1', docId: 'fresh', token: 'tFresh', updatedAtMs: NOW - 59 * DAY },
      ],
      NOW,
      60
    );
    expect([...groups.entries()]).toEqual([['u1', [{ docId: 'old', token: 'tOld' }]]]);
  });

  it('a token without updatedAt is stale', () => {
    const groups = groupStaleTokens([{ uid: 'u1', docId: 'd', token: 't', updatedAtMs: null }], NOW, 60);
    expect(groups.get('u1')).toEqual([{ docId: 'd', token: 't' }]);
  });

  it('a user with no stale token gets no entry', () => {
    const groups = groupStaleTokens([{ uid: 'u1', docId: 'd', token: 't', updatedAtMs: NOW }], NOW, 60);
    expect(groups.size).toBe(0);
  });

  // Review Focus 4: one person, two tenant accounts (two users/{uid} docs). Each account's stale
  // docs stay under its own uid; a fresh token of either account is never in the result.
  it('keeps the accounts of a member of several tenants apart', () => {
    const groups = groupStaleTokens(
      [
        { uid: 'scsUid', docId: 'a1', token: 'phoneOld', updatedAtMs: NOW - 90 * DAY },
        { uid: 'kringUid', docId: 'b1', token: 'laptopOld', updatedAtMs: NOW - 70 * DAY },
        { uid: 'scsUid', docId: 'a2', token: 'phoneNew', updatedAtMs: NOW - 1 * DAY },
        { uid: 'kringUid', docId: 'b2', token: 'tabletOld', updatedAtMs: null },
      ],
      NOW,
      60
    );
    expect(groups.get('scsUid')).toEqual([{ docId: 'a1', token: 'phoneOld' }]);
    expect(groups.get('kringUid')).toEqual([
      { docId: 'b1', token: 'laptopOld' },
      { docId: 'b2', token: 'tabletOld' },
    ]);
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
