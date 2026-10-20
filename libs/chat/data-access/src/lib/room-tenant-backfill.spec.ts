import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Functions } from 'firebase/functions';

const callable = vi.fn();
const httpsCallable = vi.fn(() => callable);
vi.mock('firebase/functions', () => ({ httpsCallable: (...a: unknown[]) => (httpsCallable as (...x: unknown[]) => unknown)(...a) }));

import { backfillRoomTenants } from './room-tenant-backfill';

const functions = {} as Functions;

describe('backfillRoomTenants', () => {
  beforeEach(() => { callable.mockReset(); httpsCallable.mockClear(); });

  it('calls backfillMatrixRoomTenants with the dryRun flag', async () => {
    callable.mockResolvedValue({ data: { stamped: 0, alreadyMarked: 0, ambiguous: [], changes: {}, dryRun: true } });
    await backfillRoomTenants(functions, true);
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'backfillMatrixRoomTenants');
    expect(callable).toHaveBeenCalledWith({ dryRun: true });
  });

  it('maps changes to entries with names, falls back to an empty name, and passes counts through', async () => {
    callable.mockResolvedValue({ data: {
      stamped: 2, alreadyMarked: 5, ambiguous: ['!x:srv', '!y:srv'], dryRun: false,
      changes: { '!a:srv': ['scs'], '!b:srv': ['scs', 'gss'] },
      names: { '!a:srv': 'Vorstand' },
    } });
    const r = await backfillRoomTenants(functions, false);
    expect(callable).toHaveBeenCalledWith({ dryRun: false });
    expect(r.changes).toEqual([
      { roomId: '!a:srv', name: 'Vorstand', tenants: ['scs'] },
      { roomId: '!b:srv', name: '', tenants: ['scs', 'gss'] },
    ]);
    expect(r.stamped).toBe(2);
    expect(r.alreadyMarked).toBe(5);
    expect(r.ambiguous).toEqual(['!x:srv', '!y:srv']);
    expect(r.dryRun).toBe(false);
  });

  it('tolerates a response without names', async () => {
    callable.mockResolvedValue({ data: { stamped: 0, alreadyMarked: 0, ambiguous: [], changes: { '!a:srv': ['scs'] }, dryRun: true } });
    expect((await backfillRoomTenants(functions, true)).changes[0].name).toBe('');
  });
});
