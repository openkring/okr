// apps/functions/src/privacy/reap-exports.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';

const REGION = 'europe-west6';

/** Reap artifacts older than 24 hours (D-P5-1). */
export const REAP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The ONLY path segment this job is allowed to touch. Every export artifact created by
 * `exportMyData` lives under `tenant/{tenantId}/private/exports/{uid}/...`; this segment
 * is what keeps the reaper structurally incapable of deleting tenant data — a file whose
 * name does not contain it is never even considered, regardless of age. */
const EXPORT_PATH_SEGMENT = '/private/exports/';

/**
 * Pure predicate deciding whether one Storage object is a reapable export artifact:
 * ANDs the two guards (right path segment, past the age cutoff). Exported so
 * `reap-exports.spec.ts` can exercise the exact rule — including the "wrong prefix, however
 * old" and "right prefix, too young" cases — without a Storage emulator. The scheduled
 * function below is the only caller that actually deletes anything.
 */
export function isReapableExportArtifact(
  name: string,
  timeCreated: string | undefined,
  nowMs: number,
  maxAgeMs = REAP_MAX_AGE_MS,
): boolean {
  if (!name.includes(EXPORT_PATH_SEGMENT)) return false;
  const createdMs = new Date(timeCreated ?? 0).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return false;
  return nowMs - createdMs > maxAgeMs;
}

/**
 * D-P5-1 reaper: the only scheduled job in the plan. Runs daily and deletes export ZIPs
 * once they are older than 24 hours — signed URLs are 15 minutes anyway, so anything
 * still sitting in Storage a day later is a stale artifact, never a live download.
 * Scoped to `tenant/` (never lists outside it) and, per object, to
 * `isReapableExportArtifact` — it cannot delete anything that isn't an export artifact.
 */
export const reapPrivacyExports = onSchedule(
  { region: REGION, schedule: 'every 24 hours' },
  async () => {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'tenant/' });
    const now = Date.now();

    let deleted = 0;
    for (const f of files) {
      if (isReapableExportArtifact(f.name, f.metadata.timeCreated, now)) {
        await f.delete();
        deleted += 1;
      }
    }
    logger.info(`reapPrivacyExports: deleted ${deleted} export artifact(s) of ${files.length} scanned`);
  },
);
