import { beforeEach, describe, expect, it, vi } from 'vitest';

const names = ['handleMembershipMatrixSync', 'handlePinboardSourceMembership', 'handleMembershipAccountSync', 'handleMembershipExit'];
const calls = vi.hoisted(() => ({ fns: {} as Record<string, ReturnType<typeof vi.fn>> }));

vi.mock('firebase-functions/v2/firestore', () => ({
  // the wrapped function is returned as-is so the spec can call it directly
  onDocumentWrittenWithAuthContext: (_opts: unknown, fn: unknown) => fn,
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../matrix-simple/shared', () => ({ matrixAdminToken: { value: () => 'tok' } }));
vi.mock('../matrix-simple/membership-sync', () => ({ handleMembershipMatrixSync: (e: unknown) => calls.fns['handleMembershipMatrixSync'](e) }));
vi.mock('../matrix-simple/pinboard', () => ({ handlePinboardSourceMembership: (e: unknown) => calls.fns['handlePinboardSourceMembership'](e) }));
vi.mock('../auth/account-sync', () => ({ handleMembershipAccountSync: (e: unknown) => calls.fns['handleMembershipAccountSync'](e) }));
vi.mock('../member-fee/exit-settlement.trigger', () => ({ handleMembershipExit: (e: unknown) => calls.fns['handleMembershipExit'](e) }));

import { MEMBERSHIP_HANDLERS, onMembershipDocWritten } from './on-membership-doc-written';

const run = onMembershipDocWritten as unknown as (e: unknown) => Promise<void>;

describe('memberships trigger', () => {
  beforeEach(() => {
    for (const n of names) calls.fns[n] = vi.fn().mockResolvedValue(undefined);
  });

  it('lists exactly the four handlers in order', () => {
    expect(MEMBERSHIP_HANDLERS.map((h) => h.name)).toEqual(['matrixSync', 'pinboardSource', 'accountSync', 'exitSettlement']);
  });

  it('passes the same event object to every handler', async () => {
    const event = { params: { membershipId: 'm1' }, authType: 'app_user', authId: 'u1' };
    await run(event);
    for (const n of names) {
      expect(calls.fns[n]).toHaveBeenCalledTimes(1);
      expect(calls.fns[n].mock.calls[0][0]).toBe(event);
    }
  });

  it('lets the other handlers run when one throws, and does not reject', async () => {
    calls.fns['handleMembershipAccountSync'].mockRejectedValue(new Error('boom'));
    await expect(run({ params: { membershipId: 'm1' } })).resolves.toBeUndefined();
    for (const n of names) expect(calls.fns[n]).toHaveBeenCalledTimes(1);
  });
});
