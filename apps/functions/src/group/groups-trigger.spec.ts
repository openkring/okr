import { beforeEach, describe, expect, it, vi } from 'vitest';

const names = ['handleGroupChange', 'handleGroupAdminKeys', 'handleGroupName', 'handleGroupPostPolicy', 'handleGroupChatMode', 'handleGroupChatCleanup', 'handlePinboard'];
const calls = vi.hoisted(() => ({ fns: {} as Record<string, ReturnType<typeof vi.fn>> }));

vi.mock('firebase-functions/v2/firestore', () => ({
  // the wrapped function is returned as-is so the spec can call it directly
  onDocumentWritten: (_opts: unknown, fn: unknown) => fn,
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../matrix-simple/shared', () => ({ matrixAdminToken: { value: () => 'tok' } }));
vi.mock('../replication', () => ({ handleGroupChange: (e: unknown) => calls.fns['handleGroupChange'](e) }));
vi.mock('./on-group-written', () => ({ handleGroupAdminKeys: (e: unknown) => calls.fns['handleGroupAdminKeys'](e) }));
vi.mock('../matrix-simple/group-name-sync', () => ({ handleGroupName: (e: unknown) => calls.fns['handleGroupName'](e) }));
vi.mock('../matrix-simple/post-policy-sync', () => ({ handleGroupPostPolicy: (e: unknown) => calls.fns['handleGroupPostPolicy'](e) }));
vi.mock('../matrix-simple/chat-mode-sync', () => ({ handleGroupChatMode: (e: unknown) => calls.fns['handleGroupChatMode'](e) }));
vi.mock('../matrix-simple/group-chat-cleanup', () => ({ handleGroupChatCleanup: (e: unknown) => calls.fns['handleGroupChatCleanup'](e) }));
vi.mock('../matrix-simple/pinboard', () => ({ handlePinboard: (e: unknown) => calls.fns['handlePinboard'](e) }));

import { GROUP_HANDLERS, onGroupDocWritten } from './on-group-doc-written';

describe('groups trigger', () => {
  beforeEach(() => {
    for (const n of names) calls.fns[n] = vi.fn().mockResolvedValue(undefined);
  });

  it('lists exactly the seven handlers in order', () => {
    expect(GROUP_HANDLERS.map((h) => h.name)).toEqual(['replication', 'adminKeys', 'name', 'postPolicy', 'chatMode', 'chatCleanup', 'pinboard']);
  });

  it('passes the same event object to every handler', async () => {
    const event = { params: { groupId: 'g1' } };
    await (onGroupDocWritten as unknown as (e: unknown) => Promise<void>)(event);
    for (const n of names) {
      expect(calls.fns[n]).toHaveBeenCalledTimes(1);
      expect(calls.fns[n].mock.calls[0][0]).toBe(event);
    }
  });

  it('lets the other handlers run when one throws, and does not reject', async () => {
    calls.fns['handleGroupName'].mockRejectedValue(new Error('boom'));
    const event = { params: { groupId: 'g1' } };
    await expect((onGroupDocWritten as unknown as (e: unknown) => Promise<void>)(event)).resolves.toBeUndefined();
    for (const n of names) expect(calls.fns[n]).toHaveBeenCalledTimes(1);
  });
});
