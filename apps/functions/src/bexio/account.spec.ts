import { beforeEach, describe, expect, it, vi } from 'vitest';

let roles: Record<string, boolean> = {};
let backend: string | undefined = 'bexio';

const fakeDb = {
  collection: (name: string) => ({
    doc: () => ({
      get: async () =>
        name === 'users'
          ? { exists: true, data: () => ({ roles, tenants: ['scs'] }) }
          : { exists: true, data: () => ({ accountingBackend: backend }) },
    }),
  }),
};

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb }));
vi.mock('firebase-admin', () => ({ firestore: () => fakeDb }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'scs' }) }));
vi.mock('axios', () => ({ default: { get: vi.fn(async () => ({ data: [] })) } }));

import { syncBexioAccounts } from './account';

const req = () => ({ auth: { uid: 'u1', token: {} }, app: {}, data: {} }) as never;

describe('syncBexioAccounts authorization', () => {
  beforeEach(() => {
    roles = {};
    backend = 'bexio';
  });

  it('rejects a signed-in user who is not an admin', async () => {
    await expect(syncBexioAccounts.run(req())).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a treasurer who is not an admin', async () => {
    roles = { treasurer: true };
    await expect(syncBexioAccounts.run(req())).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lets an admin pass the role check, then stops at the backend gate when the books are native', async () => {
    roles = { admin: true };
    backend = 'native';
    await expect(syncBexioAccounts.run(req())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
