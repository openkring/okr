import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));

vi.mock('firebase-admin/firestore', () => {
  const ref = (path: string) => ({ path });
  const db = {
    doc: ref,
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      get: async (r: { path: string }) => ({ exists: store.docs.has(r.path), data: () => store.docs.get(r.path) }),
      set: (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        store.docs.set(r.path, opts?.merge ? { ...(store.docs.get(r.path) ?? {}), ...data } : data);
      },
    }),
    getAll: async (...refs: { path: string }[]) => refs.map((r) => ({ exists: store.docs.has(r.path), data: () => store.docs.get(r.path) })),
  };
  return { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'ts' } };
});

import { addChatBadge, readBadgeSums, setBadgePart } from './ledger';

describe('badge ledger', () => {
  beforeEach(() => store.docs.clear());

  it('addChatBadge dedupes the same event id', async () => {
    store.docs.set('users/u1/badge/counts', { chat: 0, tasks: 2, invitations: 0, seen: [], fromApp: true });
    expect(await addChatBadge('u1', 'e1')).toBe(3);
    expect(await addChatBadge('u1', 'e1')).toBe(3);
    expect(await addChatBadge('u1', 'e2')).toBe(4);
  });

  it('addChatBadge returns undefined until the app has written the parts', async () => {
    expect(await addChatBadge('u2', 'e1')).toBeUndefined();
  });

  it('readBadgeSums maps uid to sum, undefined when unknown', async () => {
    store.docs.set('users/u1/badge/counts', { chat: 0, tasks: 0, invitations: 0, seen: [], fromApp: true });
    await setBadgePart('u1', 'invitations', 1);
    const sums = await readBadgeSums(['u1', 'u3']);
    expect(sums.get('u1')).toBe(1);
    expect(sums.get('u3')).toBeUndefined();
  });
});
