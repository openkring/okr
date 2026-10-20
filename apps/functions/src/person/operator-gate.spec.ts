import { beforeEach, describe, expect, it, vi } from 'vitest';

// The caller's users/{uid} doc is switched per test; collection-wide scans and writes are counted.
const state = vi.hoisted(() => ({
  user: { roles: { admin: true }, tenants: ['scs'] } as Record<string, unknown>,
  scans: 0,
  sets: 0,
  commits: 0,
}));

const userDocs = [
  { id: 'u1', data: () => ({ personKey: 'p1', tenants: ['scs'] }) },
  { id: 'u2', data: () => ({ personKey: 'p2', tenants: ['kring'] }) },
];
// p1 is stale (no accountTenants), p2 already matches: a real run writes exactly one doc.
const personDocs = [
  { id: 'p1', ref: { id: 'p1' }, data: () => ({}) },
  { id: 'p2', ref: { id: 'p2' }, data: () => ({ accountTenants: ['kring'] }) },
];
const snapOf = (docs: unknown[]) => ({ docs, empty: docs.length === 0, size: docs.length });

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    batch: () => ({
      set: () => { state.sets++; },
      commit: async () => { state.commits++; },
    }),
    collection: (name: string) => {
      const scan = async () => { state.scans++; return snapOf(name === 'users' ? userDocs : name === 'persons' ? personDocs : []); };
      return {
        get: scan,
        orderBy: () => ({ limit: () => ({ get: scan }) }),
      };
    },
  }),
}));
// The operator decision stays the real isOperatorUserData; the util lib's own Firestore read
// is replaced by the switchable users doc. The other gate checks are no-ops (not under test).
vi.mock('@okr/shared-util-functions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@okr/shared-util-functions')>();
  return {
    ...actual,
    checkAppCheckToken: () => undefined,
    checkAuthentication: () => undefined,
    checkAdminRole: async () => undefined,
    writeAddressDirectory: async () => ({ crossTenant: 0 }),
    checkOperatorTenant: async (_req: unknown, name: string) => {
      if (!actual.isOperatorUserData(state.user)) {
        throw new HttpsError('permission-denied', `${name}: not the operator`);
      }
      return actual.OPERATOR_TENANT_ID;
    },
  };
});

import { HttpsError } from 'firebase-functions/v2/https';
import { rebuildAddressDirectory } from '../address/rebuild-address-directory';
import { backfillAccountTenants } from './account-mirror';

const req = (data: unknown = {}) => ({ auth: { uid: 'u1' }, app: {}, data }) as never;
const handlers = { backfillAccountTenants, rebuildAddressDirectory } as const;

describe('operator gate on cross-tenant AOC tools', () => {
  beforeEach(() => {
    state.scans = 0;
    state.sets = 0;
    state.commits = 0;
  });

  for (const [name, handler] of Object.entries(handlers)) {
    it(`${name}: an admin of tenant scs gets permission-denied and nothing is scanned`, async () => {
      state.user = { roles: { admin: true }, tenants: ['scs'] };
      await expect(handler.run(req())).rejects.toMatchObject({ code: 'permission-denied' });
      expect(state.scans).toBe(0);
      expect(state.sets).toBe(0);
    });

    it(`${name}: an admin of tenant bka passes the gate`, async () => {
      state.user = { roles: { admin: true }, tenants: ['bka'] };
      await expect(handler.run(req())).resolves.toBeDefined();
      expect(state.scans).toBeGreaterThan(0);
    });
  }
});

describe('backfillAccountTenants dryRun', () => {
  beforeEach(() => {
    state.user = { roles: { admin: true }, tenants: ['bka'] };
    state.scans = 0;
    state.sets = 0;
    state.commits = 0;
  });

  it('writes nothing and reports what a real run would write', async () => {
    const result = await backfillAccountTenants.run(req({ dryRun: true }));
    expect(result).toEqual({ users: 2, persons: 2, written: 0, pending: 1 });
    expect(state.sets).toBe(0);
    expect(state.commits).toBe(0);
  });

  it.each([['true', 'true'], ['1', 1], ['null', null], ['object', {}]])('rejects a non-boolean dryRun (%s) without scanning or writing', async (_l, value) => {
    await expect(backfillAccountTenants.run(req({ dryRun: value }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.scans).toBe(0);
    expect(state.sets).toBe(0);
  });

  it('a real run writes the stale doc and reports pending 0', async () => {
    const result = await backfillAccountTenants.run(req());
    expect(result).toEqual({ users: 2, persons: 2, written: 1, pending: 0 });
    expect(state.sets).toBe(1);
    expect(state.commits).toBe(1);
  });
});
