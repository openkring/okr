import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { WebsiteModel } from '@okr/shared-models';

import { runRollback, type RollbackDeps } from './rollback-website';

const SITE = { okey: 'scs', tenants: ['scs'], hostingSite: 'scs-web' } as unknown as WebsiteModel;
const REQ = { site: SITE, personKey: 'pA' };

function deps() {
  return {
    acquireLock: vi.fn(async () => ({ id: 'lock1' }) as { id: string } | undefined),
    closeLock: vi.fn(async () => undefined),
    listReleases: vi.fn(async () => [
      { name: 'sites/scs-web/releases/r2', version: 'sites/scs-web/versions/v2', createTime: '' },
      { name: 'sites/scs-web/releases/r1', version: 'sites/scs-web/versions/v1', createTime: '' },
    ]),
    releaseExisting: vi.fn(async () => 'sites/scs-web/releases/r3'),
    markPublished: vi.fn(async () => undefined),
  } satisfies RollbackDeps;
}

describe('runRollback', () => {
  let d: ReturnType<typeof deps>;
  beforeEach(() => {
    d = deps();
  });

  it('re-releases the version before the current one and logs a rollback', async () => {
    expect(await runRollback(d, REQ)).toEqual({ version: 'sites/scs-web/versions/v1' });
    expect(d.listReleases).toHaveBeenCalledWith('scs-web', 2);
    expect(d.releaseExisting).toHaveBeenCalledWith('scs-web', 'sites/scs-web/versions/v1', expect.any(String));
    expect(d.markPublished).toHaveBeenCalledWith('scs', { lastPublishedVersion: 'sites/scs-web/versions/v1' });
    expect(d.closeLock).toHaveBeenCalledWith('scs', 'lock1', 'rollback', { version: 'sites/scs-web/versions/v1', replacedVersion: 'sites/scs-web/versions/v2' });
  });

  it('refuses alreadyRunning while a publish holds the lock', async () => {
    d.acquireLock.mockResolvedValueOnce(undefined);
    const error = await runRollback(d, REQ).catch((e: unknown) => e);
    expect((error as HttpsError).code).toBe('failed-precondition');
    expect((error as HttpsError).message).toBe('alreadyRunning');
    expect(d.listReleases).not.toHaveBeenCalled();
  });

  it('refuses noPreviousRelease with a single release, releasing nothing', async () => {
    d.listReleases.mockResolvedValueOnce([{ name: 'r1', version: 'sites/scs-web/versions/v1', createTime: '' }]);
    const error = await runRollback(d, REQ).catch((e: unknown) => e);
    expect((error as HttpsError).message).toBe('noPreviousRelease');
    expect(d.releaseExisting).not.toHaveBeenCalled();
    expect(d.closeLock).toHaveBeenCalledWith('scs', 'lock1', 'refused', { detail: 'noPreviousRelease' });
  });

  it('closes the lock failed and throws internal when Hosting fails', async () => {
    d.releaseExisting.mockRejectedValueOnce(new Error('Hosting POST /v1beta1/sites/scs-web/releases failed (403)'));
    const error = await runRollback(d, REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('internal');
    expect(d.markPublished).not.toHaveBeenCalled();
    expect(d.closeLock).toHaveBeenCalledWith('scs', 'lock1', 'failed', { detail: 'Hosting POST /v1beta1/sites/scs-web/releases failed (403)' });
  });
});
