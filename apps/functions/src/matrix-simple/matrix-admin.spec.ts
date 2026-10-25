import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'tok' }) }));

import { MATRIX_ADMIN_OPS, MATRIX_ADMIN_OPTIONS } from './matrix-admin';
import * as credentials from './credentials';
import * as membership from './membership-sync';
import * as postPolicy from './post-policy-sync';
import * as roomAssignment from './room-assignment';
import * as rooms from './rooms';
import * as tenantBackfill from './tenant-backfill';

const NAMES = [
  'listMatrixRooms', 'getRoomDetails', 'getAllMembersFromRoom', 'getRoomMessages', 'getMemberDetails',
  'addMatrixRoomAlias', 'deleteMatrixRoom', 'renameMatrixRoom', 'setKioskCallRoomPolicy',
  'deactivateMatrixUser', 'repairMatrixDisplayNames', 'repairMatrixAvatars', 'backfillMatrixRoomTenants',
  'listUnassignedMatrixRooms', 'assignMatrixRoomTenants', 'auditGroupRoomMembers', 'pruneGroupRoomExtras',
  'reconcileGroupRoomMembers', 'syncRoomPostPolicy',
];
const modules: Record<string, unknown>[] = [credentials, membership, postPolicy, roomAssignment, rooms, tenantBackfill];

describe('matrixAdmin op table', () => {
  it('has exactly the 19 old callable names as keys', () => {
    expect(Object.keys(MATRIX_ADMIN_OPS).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name}: the op is the handler its alias wraps`, () => {
      const handler = 'handle' + name[0].toUpperCase() + name.slice(1);
      const owner = modules.find((m) => handler in m);
      expect(owner, `${handler} exported`).toBeDefined();
      expect(MATRIX_ADMIN_OPS[name]).toBe(owner![handler]);
      expect(typeof (owner![name] as { run: unknown }).run).toBe('function');
    });
  }

  it('uses the router options from the consolidation spec', () => {
    expect(MATRIX_ADMIN_OPTIONS).toMatchObject({
      cors: true,
      region: 'europe-west6',
      enforceAppCheck: true,
      timeoutSeconds: 540,
    });
    expect(MATRIX_ADMIN_OPTIONS.secrets).toHaveLength(1);
  });
});
