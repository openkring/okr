// apps/functions/src/privacy/export-my-data.ts
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { AppConfigCollection, UserCollection } from '@okr/shared-models';
import type { ExportMyDataResponse } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { getTodayStr, DateFormat } from '@okr/shared-util-core';

import { gatherSubjectData } from './gather';
import { renderExportReport, renderReadme } from './report';
import type { SubjectCtx } from './types';

const REGION = 'europe-west6';

/** One export per user per hour (D-P5-1 rate limit). */
const EXPORT_COOLDOWN_MS = 60 * 60 * 1000;
/** Signed URL lifetime — the export ZIP contains AHV, dob and IBAN in plaintext, so this
 * stays short (D-P5-1). */
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** Storage prefix for one user's export artifacts. MUST stay under `tenant/{tenantId}/private/`
 * — `storage.rules` denies read+write on that whole prefix to every client; only a Cloud
 * Function (this one, and the reaper) may touch it, and members are served exclusively via
 * the short-lived signed URL returned below. */
function exportPrefix(tenantId: string, uid: string): string {
  return `tenant/${tenantId}/private/exports/${uid}/`;
}

export type { ExportMyDataResponse } from '@okr/shared-models';

/**
 * Pure rate-limit predicate: given the newest existing export artifact's creation time
 * (`0`/non-finite if the user has never exported), decide whether a new export is allowed
 * right now. Split out from `assertRateLimit` (which talks to `getStorage()`) so
 * `export-my-data.spec.ts` can exercise the one-per-hour rule without a Storage emulator.
 */
export function isRateLimited(newestCreatedAtMs: number, nowMs: number, cooldownMs = EXPORT_COOLDOWN_MS): boolean {
  if (!Number.isFinite(newestCreatedAtMs) || newestCreatedAtMs <= 0) return false;
  return nowMs - newestCreatedAtMs < cooldownMs;
}

/** Backed by the export artifacts already in Storage — no extra Firestore collection. */
async function assertRateLimit(tenantId: string, uid: string): Promise<void> {
  const [files] = await getStorage().bucket().getFiles({ prefix: exportPrefix(tenantId, uid), maxResults: 10 });
  const newest = files
    .map((f) => new Date(f.metadata.timeCreated ?? 0).getTime())
    .sort((a, b) => b - a)[0] ?? 0;
  if (isRateLimited(newest, Date.now())) {
    throw new HttpsError('resource-exhausted',
      'Ein Datenexport ist einmal pro Stunde möglich. Bitte versuchen Sie es später erneut.');
  }
}

/**
 * Pure derivation of the export subject's `SubjectCtx` from the CALLER'S OWN `users/{uid}`
 * document data. There is deliberately no parameter anywhere (here or on the callable) that
 * names a different subject — that is what makes `exportMyData` structurally incapable of
 * exporting anyone else's data; adding an on-behalf-of parameter is an explicit non-goal.
 * Exported so `export-my-data.spec.ts` can test the derivation (including the missing
 * personKey/tenantId failure path) without Firestore.
 */
export function buildSubjectCtx(uid: string, userData: Record<string, unknown> | undefined): SubjectCtx {
  const personKey = String(userData?.['personKey'] ?? '');
  const tenants = Array.isArray(userData?.['tenants']) ? (userData['tenants'] as string[]) : [];
  const tenantId = tenants[0] ?? '';
  const email = String(userData?.['loginEmail'] ?? '').toLowerCase();

  if (personKey === '' || tenantId === '') {
    throw new HttpsError('failed-precondition', 'User is not linked to a person or a tenant.');
  }
  return { uid, personKey, parentKey: `person.${personKey}`, tenantId, email };
}

/** Plain-text imprint/contact block for `renderReadme`'s "who is responsible" section,
 * built from the tenant's `app-config` operator fields (no dedicated "controller" field
 * exists on `AppConfig`). Falls back to the tenant name if the operator block is empty. */
function buildController(config: Record<string, unknown> | undefined, tenantName: string): string {
  if (!config) return tenantName;
  const cityLine = [String(config['opZipCode'] ?? ''), String(config['opCity'] ?? '')]
    .filter((p) => p !== '').join(' ');
  const email = String(config['opEmail'] ?? '');
  const lines = [
    String(config['opName'] ?? ''),
    String(config['opStreet'] ?? ''),
    cityLine,
    email !== '' ? `E-Mail: ${email}` : '',
  ].filter((line) => line !== '');
  return lines.length > 0 ? lines.join('\n') : tenantName;
}

/** Best-effort: the ZIP still ships without an avatar if Storage read fails (e.g. the
 * member never uploaded one, or the file was already reaped). Never fails the export. */
async function fetchAvatarBuffer(storagePath: string): Promise<Buffer | undefined> {
  try {
    const [buf] = await getStorage().bucket().file(storagePath).download();
    return buf;
  } catch (err) {
    logger.warn(`exportMyData: could not download avatar at ${storagePath}: ${String(err)}`);
    return undefined;
  }
}

function avatarStoragePath(bundleFull: Record<string, unknown[]>): string | undefined {
  const entries = bundleFull['avatars'] as Array<Record<string, unknown>> | undefined;
  const storagePath = entries?.[0]?.['storagePath'];
  return typeof storagePath === 'string' && storagePath !== '' ? storagePath : undefined;
}

/**
 * D-P5-1 export delivery: gathers the caller's own subject-access export (via
 * `gatherSubjectData`, B1), renders it (via `renderExportReport`/`renderReadme`, B2), zips
 * it, uploads it to a Cloud-Function-only Storage prefix, and returns a 15-minute signed
 * URL. No role check and no on-behalf-of parameter — see `buildSubjectCtx` above.
 */
export const exportMyData = onCall<void, Promise<ExportMyDataResponse>>(
  { region: REGION, enforceAppCheck: true, memory: '512MiB', timeoutSeconds: 300 },
  async (request) => {
    checkAppCheckToken(request, 'exportMyData');
    checkAuthentication(request, 'exportMyData');

    const uid = request.auth!.uid;
    const db = getFirestore();

    const userSnap = await db.collection(UserCollection).doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError('permission-denied', 'No user document for the caller.');
    }
    const ctx = buildSubjectCtx(uid, userSnap.data());

    await assertRateLimit(ctx.tenantId, uid);

    const configSnap = await db.collection(AppConfigCollection).doc(ctx.tenantId).get();
    const config = configSnap.exists ? configSnap.data() : undefined;
    const tenantName = String(config?.['appName'] ?? ctx.tenantId);
    const controller = buildController(config, tenantName);

    const bundle = await gatherSubjectData(ctx);

    const zip = new JSZip();
    zip.file('data.json', JSON.stringify(bundle, null, 2));
    zip.file('report.html', renderExportReport(bundle, tenantName));
    zip.file('README.txt', renderReadme(tenantName, controller));

    const storagePath = avatarStoragePath(bundle.full);
    if (storagePath) {
      const avatarBuffer = await fetchAvatarBuffer(storagePath);
      if (avatarBuffer) {
        const dot = storagePath.lastIndexOf('.');
        const ext = dot >= 0 ? storagePath.slice(dot + 1) : 'bin';
        zip.file(`avatar.${ext}`, avatarBuffer);
      }
    }

    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const token = randomUUID();
    const stamp = getTodayStr(DateFormat.StoreDateTime);
    const path = `${exportPrefix(ctx.tenantId, uid)}${stamp}-${token}.zip`;
    const file = getStorage().bucket().file(path);
    await file.save(buf, { contentType: 'application/zip', resumable: false });

    const expiresAtMs = Date.now() + SIGNED_URL_TTL_MS;
    const [downloadUrl] = await file.getSignedUrl({ action: 'read', expires: expiresAtMs });

    // no PII in logs — uid, tenant and byte count only
    logger.info(`exportMyData: uid=${uid} tenant=${ctx.tenantId} bytes=${buf.length}`);

    return {
      downloadUrl,
      expiresAt: new Date(expiresAtMs).toISOString(),
      sizeBytes: buf.length,
    };
  },
);
