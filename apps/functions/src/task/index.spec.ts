import { beforeEach, describe, expect, it, vi } from 'vitest';

// handleTaskWritten keeps the task part of the server badge ledger (spec 1.127 §3.7 B1): every
// assignee whose open-task count the write changes is recomputed, BEFORE the push reads the sum.

const h = vi.hoisted(() => ({
  order: [] as string[],
  counts: new Map<string, number>(),
  accounts: new Map<string, { uid: string; roles?: Record<string, boolean> }[]>(),
  setBadgePart: vi.fn(),
  pushToPersons: vi.fn(),
}));

vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('firebase-admin/firestore', () => {
  const makeQuery = (filters: unknown[][]) => ({
    where: (...args: unknown[]) => makeQuery([...filters, args]),
    count: () => ({
      get: async () => {
        const assignee = filters.find((f) => f[0] === 'assignee.key')?.[2] as string;
        return { data: () => ({ count: h.counts.get(assignee) ?? 0 }) };
      },
    }),
  });
  return { getFirestore: () => ({ collection: () => makeQuery([]) }) };
});
vi.mock('./task-diary', () => ({ applyTaskToDiary: vi.fn() }));
vi.mock('../badge/ledger', () => ({
  setBadgePart: (uid: string, part: string, n: number) => {
    h.order.push(`ledger:${uid}`);
    return h.setBadgePart(uid, part, n);
  },
}));
vi.mock('../srv/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../srv/push')>()),
  accountsInTenant: async (keys: string[]) => keys.flatMap((k) => h.accounts.get(k) ?? []),
  pushToPersons: (...args: unknown[]) => {
    h.order.push('push');
    return h.pushToPersons(...args);
  },
}));

import { handleTaskWritten } from './index';
import type { TaskWrittenEvent } from './task-written-event';

const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data, exists: data !== undefined });
const ev = (before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) =>
  ({ params: { taskId: 't1' }, data: { before: snap(before), after: snap(after) } }) as unknown as TaskWrittenEvent;

const task = { name: 'Boot putzen', completionDate: '', isArchived: false, tenants: ['scs'], author: { key: 'Z' } };

describe('handleTaskWritten — badge ledger', () => {
  beforeEach(() => {
    h.order = [];
    h.counts = new Map([['A', 1], ['B', 4]]);
    h.accounts = new Map([
      ['A', [{ uid: 'uA', roles: { registered: true } }]],
      ['B', [{ uid: 'uB1', roles: { registered: true } }, { uid: 'uB2', roles: {} }]],
    ]);
    h.setBadgePart.mockReset().mockResolvedValue(undefined);
    h.pushToPersons.mockReset().mockResolvedValue({ recipients: 1, sent: 1, failed: 0 });
  });

  it('recomputes tasks for the new and the previous assignee', async () => {
    await handleTaskWritten(ev({ ...task, assignee: { key: 'A' } }, { ...task, assignee: { key: 'B' } }));
    expect(h.setBadgePart.mock.calls).toEqual([
      ['uA', 'tasks', 1],
      ['uB1', 'tasks', 4],
      ['uB2', 'tasks', 0], // not registered: the cards hide tasks, so does the badge
    ]);
  });

  it('writes the ledger before the push reads it', async () => {
    await handleTaskWritten(ev(undefined, { ...task, assignee: { key: 'B' } }));
    expect(h.order).toEqual(['ledger:uB1', 'ledger:uB2', 'push']);
    // the web data keeps the recipient-independent count, as before
    expect(h.pushToPersons.mock.calls[0][1]).toMatchObject({ type: 'task', badgeTasks: 4 });
  });

  it('recomputes on completion without a push', async () => {
    await handleTaskWritten(ev({ ...task, assignee: { key: 'A' } }, { ...task, assignee: { key: 'A' }, completionDate: '20261031' }));
    expect(h.setBadgePart.mock.calls).toEqual([['uA', 'tasks', 1]]);
    expect(h.pushToPersons).not.toHaveBeenCalled();
  });

  it('touches nothing on an unrelated change', async () => {
    await handleTaskWritten(ev({ ...task, assignee: { key: 'A' } }, { ...task, assignee: { key: 'A' }, name: 'neu' }));
    expect(h.setBadgePart).not.toHaveBeenCalled();
  });

  it('still pushes when the ledger write fails', async () => {
    h.setBadgePart.mockRejectedValue(new Error('unavailable'));
    await handleTaskWritten(ev(undefined, { ...task, assignee: { key: 'A' } }));
    expect(h.pushToPersons).toHaveBeenCalledTimes(1);
  });
});
