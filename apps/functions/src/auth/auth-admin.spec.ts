import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn() }));

import { AUTH_ADMIN_OPS, AUTH_ADMIN_OPTIONS } from './auth-admin';
import * as authIndex from './index';
import * as loginIdAdmin from './login-id-admin';
import * as accountSync from './account-sync';

const NAMES = [
  'createCustomToken', 'createFirebaseUser', 'getUidByEmail', 'getFirebaseUser', 'setPassword',
  'updateFirebaseUser', 'listFirebaseUsers', 'listBkUsers', 'deleteFirebaseAuthUser',
  'swapLoginEmail', 'setLoginId', 'syncPersonAccount',
];
const modules: Record<string, unknown>[] = [authIndex, loginIdAdmin, accountSync];

describe('authAdmin op table', () => {
  it('has exactly the 12 old callable names as keys', () => {
    expect(Object.keys(AUTH_ADMIN_OPS).sort()).toEqual([...NAMES].sort());
  });

  it('keeps listMyLoginTenants out of the router', () => {
    expect(AUTH_ADMIN_OPS['listMyLoginTenants']).toBeUndefined();
  });

  for (const name of NAMES) {
    it(`${name}: the op is the handler its alias wraps`, () => {
      const handler = 'handle' + name[0].toUpperCase() + name.slice(1);
      const owner = modules.find((m) => handler in m);
      expect(owner, `${handler} exported`).toBeDefined();
      expect(AUTH_ADMIN_OPS[name]).toBe(owner![handler]);
      expect(typeof (owner![name] as { run: unknown }).run).toBe('function');
    });
  }

  it('uses the router options from the consolidation spec (no secrets)', () => {
    expect(AUTH_ADMIN_OPTIONS).toEqual({ cors: true, region: 'europe-west6', enforceAppCheck: true });
  });
});
