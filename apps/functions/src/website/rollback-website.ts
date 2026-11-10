// rollbackWebsite (design §7.2 «Vorherige Version wiederherstellen»): re-releases the Hosting version of
// the release before the current one. Takes the publish lock, so it never races a publish, and logs a
// `publishes` doc with state `rollback`.
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { WebsiteModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkRoles } from '@okr/shared-util-functions';

import { listReleases, releaseExisting, type ReleaseInfo } from './hosting-client';
import { acquireLock, closeLock, type PublishLock, type PublishState } from './publish-lock';
import { authorizeSite, markSitePublished, PUBLISH_ROLES, type SitePublishedFields } from './publish-website';

const REGION = 'europe-west6';

export interface RollbackDeps {
  acquireLock(siteId: string, personKey: string, tenants: string[]): Promise<PublishLock | undefined>;
  closeLock(siteId: string, lockId: string, state: Exclude<PublishState, 'running'>, fields: Record<string, unknown>): Promise<void>;
  listReleases(hostingSite: string, pageSize: number): Promise<ReleaseInfo[]>;
  releaseExisting(hostingSite: string, version: string, message: string): Promise<string>;
  markPublished(siteId: string, fields: SitePublishedFields): Promise<void>;
}

export async function runRollback(deps: RollbackDeps, req: { site: WebsiteModel; personKey: string }): Promise<{ version: string }> {
  const { site, personKey } = req;
  const siteId = site.okey;
  const lock = await deps.acquireLock(siteId, personKey, site.tenants ?? []);
  if (!lock) throw new HttpsError('failed-precondition', 'alreadyRunning');

  let previous: string | undefined;
  try {
    const releases = site.hostingSite ? await deps.listReleases(site.hostingSite, 2) : [];
    previous = releases[1]?.version || undefined;
    if (previous) {
      await deps.releaseExisting(site.hostingSite, previous, `rollbackWebsite ${siteId}`);
      await deps.markPublished(siteId, { lastPublishedVersion: previous });
      await deps.closeLock(siteId, lock.id, 'rollback', { version: previous, replacedVersion: releases[0]?.version || undefined });
      return { version: previous };
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.error(`rollbackWebsite: ${siteId} failed: ${detail}`);
    try {
      await deps.closeLock(siteId, lock.id, 'failed', { detail });
    } catch (closeError) {
      logger.error(`rollbackWebsite: ${siteId} lock ${lock.id} not closed: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
    }
    throw new HttpsError('internal', 'Die vorherige Version konnte nicht wiederhergestellt werden.');
  }
  await deps.closeLock(siteId, lock.id, 'refused', { detail: 'noPreviousRelease' });
  throw new HttpsError('failed-precondition', 'noPreviousRelease');
}

function realDeps(db: Firestore): RollbackDeps {
  return {
    acquireLock: (siteId, personKey, tenants) => acquireLock(db, siteId, personKey, tenants),
    closeLock: (siteId, lockId, state, fields) => closeLock(db, siteId, lockId, state, fields),
    listReleases,
    releaseExisting,
    markPublished: (siteId, fields) => markSitePublished(db, siteId, fields),
  };
}

/** Restores the previously released version of a website. */
export const rollbackWebsite = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 120 },
  async (request: CallableRequest<{ siteId?: unknown }>): Promise<{ version: string }> => {
    const CF_NAME = 'rollbackWebsite';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, PUBLISH_ROLES);
    const db = getFirestore();
    const { site, personKey } = await authorizeSite(db, request, CF_NAME, request.data?.siteId);
    const result = await runRollback(realDeps(db), { site, personKey });
    logger.info(`${CF_NAME}: ${site.okey} released ${result.version}`);
    return result;
  },
);
