import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

// Glue test for runPruneStalePushTokens: which docs are deleted with a precondition, and whose
// Matrix pushers are removed. No FCM call is made (strict 60 days, 2026-10-31).

const DAY = 24 * 60 * 60 * 1000;

interface FakeDoc {
  id: string;
  uid: string;
  token: string;
  ageDays: number;
  /** delete() rejects, as for a failed lastUpdateTime precondition. */
  refreshedMeanwhile?: boolean;
}

const state = vi.hoisted(() => ({
  docs: [] as unknown[],
  deletes: [] as { id: string; precondition: unknown }[],
  validated: [] as string[],
  pusherCalls: [] as { uid: string; pushkeys: string[] }[],
}));

vi.mock('firebase-admin/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/firestore')>();
  const query = { where: () => query, limit: () => query, get: async () => ({ docs: state.docs }) };
  return { ...actual, getFirestore: () => ({ collectionGroup: () => query }) };
});

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    send: async (msg: { token: string }) => {
      state.validated.push(msg.token);
      return 'projects/x/messages/fake';
    },
  }),
}));

vi.mock('../matrix-simple/push', () => ({
  removeMatrixPushers: vi.fn(async (uid: string, pushkeys: string[]) => {
    state.pusherCalls.push({ uid, pushkeys });
    return pushkeys.length;
  }),
}));

import { runPruneStalePushTokens } from './prune-stale-tokens';

function fakeDoc(d: FakeDoc, now: number): unknown {
  const updateTime = Timestamp.fromMillis(now - d.ageDays * DAY + 1);
  return {
    id: d.id,
    updateTime,
    data: () => ({ token: d.token, updatedAt: Timestamp.fromMillis(now - d.ageDays * DAY) }),
    ref: {
      parent: { parent: { id: d.uid, parent: { id: 'users' } } },
      delete: async (precondition: unknown) => {
        if (d.refreshedMeanwhile) throw Object.assign(new Error('FAILED_PRECONDITION'), { code: 9 });
        state.deletes.push({ id: d.id, precondition });
      },
    },
  };
}

describe('runPruneStalePushTokens', () => {
  beforeEach(() => {
    state.docs = [];
    state.deletes = [];
    state.validated = [];
    state.pusherCalls = [];
  });

  it('deletes every token older than 60 days, each with a precondition, and only their pushers', async () => {
    const now = Date.now();
    state.docs = [
      fakeDoc({ id: 'd1', uid: 'u1', token: 'old', ageDays: 90 }, now),
      fakeDoc({ id: 'd2', uid: 'u1', token: 'older', ageDays: 120 }, now),
      fakeDoc({ id: 'd3', uid: 'u2', token: 'ancient', ageDays: 300 }, now),
      fakeDoc({ id: 'd4', uid: 'u3', token: 'raced', ageDays: 80, refreshedMeanwhile: true }, now),
    ];

    const result = await runPruneStalePushTokens();

    // Age alone decides: FCM is never asked.
    expect(state.validated).toEqual([]);
    expect(state.deletes.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
    for (const d of state.deletes) expect(d.precondition).toHaveProperty('lastUpdateTime');
    // The raced doc (refreshed meanwhile) keeps its pusher, too.
    expect(state.pusherCalls).toEqual([
      { uid: 'u1', pushkeys: ['old', 'older'] },
      { uid: 'u2', pushkeys: ['ancient'] },
    ]);
    expect(result).toEqual({ users: 2, tokens: 3, pushers: 3, kept: 1 });
  });
});
