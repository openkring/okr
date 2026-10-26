import { beforeEach, describe, expect, it, vi } from 'vitest';

let roles: Record<string, boolean> = {};
let backend: string | undefined = 'bexio';

const commit = vi.fn(async () => undefined);
const batchSet = vi.fn();

const fakeDb = {
  batch: () => ({ set: batchSet, commit }),
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
vi.mock('firebase-functions/v2', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => 'scs' }) }));
vi.mock('axios', () => ({ default: { get: vi.fn(async () => ({ data: [] })) } }));

import axios from 'axios';
import { handleSyncBexioAccounts } from './account';

const req = () => ({ auth: { uid: 'u1', token: {} }, app: {}, data: {} }) as never;

describe('syncBexioAccounts authorization', () => {
  beforeEach(() => {
    roles = {};
    backend = 'bexio';
    commit.mockClear();
    batchSet.mockClear();
  });

  it('rejects a signed-in user who is not an admin', async () => {
    await expect(handleSyncBexioAccounts(req())).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a treasurer who is not an admin', async () => {
    roles = { treasurer: true };
    await expect(handleSyncBexioAccounts(req())).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lets an admin pass the role check, then stops at the backend gate when the books are native', async () => {
    roles = { admin: true };
    backend = 'native';
    await expect(handleSyncBexioAccounts(req())).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('lets an admin on the bexio backend reach the sync', async () => {
    roles = { admin: true };
    backend = 'bexio';
    await handleSyncBexioAccounts(req());
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalled();
    expect(batchSet).toHaveBeenCalled();
  });
});
