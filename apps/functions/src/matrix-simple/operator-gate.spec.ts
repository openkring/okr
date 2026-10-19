import { beforeEach, describe, expect, it, vi } from 'vitest';

// The caller's users/{uid} doc is switched per test; collection-wide scans are counted.
const state = vi.hoisted(() => ({ user: { roles: { admin: true }, tenants: ['scs'] } as Record<string, unknown>, scans: 0 }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: true, data: () => state.user }) }),
      get: async () => { state.scans++; return { docs: [], empty: true, size: 0 }; },
      where: () => ({ get: async () => { state.scans++; return { docs: [], empty: true, size: 0 }; } }),
    }),
  }),
}));
// The util lib resolves firebase-admin separately, so its Firestore read is replaced by the same
// switchable users doc; the operator decision itself stays the real isOperatorUserData.
vi.mock('@okr/shared-util-functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@okr/shared-util-functions')>();
  return {
    ...actual,
    checkOperatorTenant: async (_req: unknown, name: string) => {
      if (!actual.isOperatorUserData(state.user)) {
        throw new HttpsError('permission-denied', `${name}: not the operator`);
      }
      return actual.OPERATOR_TENANT_ID;
    },
  };
});
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { HttpsError } from 'firebase-functions/v2/https';
import { deactivateMatrixUser, repairMatrixAvatars, repairMatrixDisplayNames } from './credentials';
import { backfillMatrixRoomTenants } from './tenant-backfill';
import { listUnassignedMatrixRooms } from './room-assignment';

const req = (data: unknown = {}) => ({ auth: { uid: 'u1' }, app: {}, data }) as never;
const fetchMock = vi.fn();

const handlers = {
  repairMatrixDisplayNames,
  repairMatrixAvatars,
  deactivateMatrixUser,
  backfillMatrixRoomTenants,
  listUnassignedMatrixRooms,
} as const;

describe('operator gate on homeserver-wide chat tools', () => {
  beforeEach(() => {
    state.scans = 0;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rooms: [], users: [] }), text: async () => '{}' });
    vi.stubGlobal('fetch', fetchMock);
  });

  for (const [name, handler] of Object.entries(handlers)) {
    it(`${name}: an admin of tenant scs gets permission-denied and nothing is read`, async () => {
      state.user = { roles: { admin: true }, tenants: ['scs'] };
      await expect(handler.run(req({ personKey: 'p1' }))).rejects.toMatchObject({ code: 'permission-denied' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(state.scans).toBe(0);
    });

    it(`${name}: an admin of tenant bka passes the gate`, async () => {
      state.user = { roles: { admin: true }, tenants: ['bka'] };
      let code: string | undefined;
      try {
        await handler.run(req({ personKey: 'p1' }));
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code).not.toBe('permission-denied');
      expect(fetchMock.mock.calls.length + state.scans).toBeGreaterThan(0);
    });
  }
});
