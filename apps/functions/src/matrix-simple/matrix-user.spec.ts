import { describe, expect, it, vi } from 'vitest';

// The caller's users/{uid} doc is a plain member: no privileged / admin / memberAdmin / groupAdmin.
const state = vi.hoisted(() => ({ user: { roles: {}, tenants: ['scs'] } as Record<string, unknown> }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => state.user }) }),
    }),
  }),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { MATRIX_USER_OPS, MATRIX_USER_OPTIONS, matrixUser } from './matrix-user';
import * as adhoc from './adhoc-chat';
import * as credentials from './credentials';
import * as notesRoom from './notes-room';
import * as pinboard from './pinboard';
import * as rooms from './rooms';

const NAMES = [
  'createAdhocChat', 'addAdhocChatMembers', 'leaveAdhocChat', 'removeAdhocChatMember',
  'createPinboard', 'updatePinboard', 'archivePinboard', 'leavePinboard', 'joinPinboard', 'listAvailablePinboards',
  'invitePersonToGroupRoom', 'kickPersonFromGroupRoom', 'requestGroupRoomAccess',
  'resolveNotesRoom', 'provisionMatrixUser', 'syncFirebaseProfileToMatrix',
];
const OP_ONLY = ['syncFirebaseProfileToMatrix'];
const modules: Record<string, unknown>[] = [adhoc, credentials, notesRoom, pinboard, rooms];
const req = (data: unknown) => ({ auth: { uid: 'u1' }, app: {}, data }) as never;

describe('matrixUser op table', () => {
  it('has exactly the 16 op names as keys', () => {
    // setChatPins stays its own callable: its payload has an `op` field that dispatchOp would strip (R5).
    expect(Object.keys(MATRIX_USER_OPS)).not.toContain('setChatPins');
    expect(Object.keys(MATRIX_USER_OPS).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name}: the op is the handler its alias wraps`, () => {
      const handler = 'handle' + name[0].toUpperCase() + name.slice(1);
      const owner = modules.find((m) => handler in m);
      expect(owner, `${handler} exported`).toBeDefined();
      expect(MATRIX_USER_OPS[name]).toBe(owner![handler]);
      if (OP_ONLY.includes(name)) expect(owner![name]).toBeUndefined();
      else expect(typeof (owner![name] as { run: unknown }).run).toBe('function');
    });
  }

  it('uses the router options from the consolidation spec', () => {
    expect(MATRIX_USER_OPTIONS).toEqual({
      cors: true,
      region: 'europe-west6',
      enforceAppCheck: true,
      secrets: [expect.anything()],
    });
  });

  // Review Focus 1: the role guard lives in the body, so the router denies exactly as the alias did.
  it('createPinboard through the router: a plain member is denied', async () => {
    state.user = { roles: {}, tenants: ['scs'] };
    await expect(matrixUser.run(req({ op: 'createPinboard', name: 'x' }))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('invitePersonToGroupRoom through the router: a privileged-only caller is denied', async () => {
    state.user = { roles: { privileged: true }, tenants: ['scs'] };
    await expect(
      matrixUser.run(req({ op: 'invitePersonToGroupRoom', groupId: 'g', personKey: 'p' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('an unknown op is invalid-argument', async () => {
    await expect(matrixUser.run(req({ op: 'nope' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
