import { describe, it, expect, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../business/shared', () => ({
  requireAdmin: async (req: { auth?: { uid: string } }) => {
    if (req.auth?.uid !== 'admin') throw new HttpsError('permission-denied', 'admin only');
  },
}));
vi.mock('./selftest', () => ({ runWebhookSelftest: run }));

import { runWebhookSelftestNow } from './run-selftest';

describe('runWebhookSelftestNow', () => {
  it('rejects a non-admin without running the test', async () => {
    await expect(runWebhookSelftestNow.run({ auth: { uid: 'member' }, data: {} } as never)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(run).not.toHaveBeenCalled();
  });
  it('runs a manual test for an admin', async () => {
    run.mockResolvedValue({ level: 'ok' });
    await expect(runWebhookSelftestNow.run({ auth: { uid: 'admin' }, data: {} } as never)).resolves.toEqual({ level: 'ok' });
    expect(run).toHaveBeenCalledWith('manual');
  });
});
