import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west6';
// Collection name inlined (same convention as ocr/index.ts).
const OCR_RESULT_COLLECTION = 'ocr-results';

/** A bill scan that was never saved is reapable after 24 h (spec 1.91). */
export const REAP_BILL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The ONLY path segment this job may touch: tenant/{tenantId}/ocr/bill/... Expense receipts
 * live under ocr/expense/ and can never match. */
const BILL_SCAN_PATH = /^tenant\/[^/]+\/ocr\/bill\//;

/**
 * Pure predicate: is this Storage object an abandoned bill scan? It is the only guard that
 * decides deletion. Exported so the rule is testable without a Storage emulator.
 */
export function isReapableBillScan(
  name: string,
  timeCreated: string | undefined,
  nowMs: number,
  maxAgeMs = REAP_BILL_MAX_AGE_MS,
): boolean {
  if (!BILL_SCAN_PATH.test(name)) return false;
  const createdMs = new Date(timeCreated ?? 0).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return false;
  return nowMs - createdMs > maxAgeMs;
}

/**
 * Spec 1.91: a bill scan that was never saved is deleted after 24 h, together with its
 * ocr-results doc. A saved scan was already moved to the private bucket by writeBill, so
 * anything still under ocr/bill/ after 24 h is abandoned.
 */
export const reapBillScans = onSchedule(
  { region: REGION, schedule: 'every 24 hours' },
  async () => {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: 'tenant/', matchGlob: 'tenant/*/ocr/bill/**' });
    const db = getFirestore();
    const now = Date.now();

    let deleted = 0;
    for (const f of files) {
      if (!isReapableBillScan(f.name, f.metadata.timeCreated, now)) continue;
      const results = await db.collection(OCR_RESULT_COLLECTION).where('storagePath', '==', f.name).get();
      await Promise.all(results.docs.map((d) => d.ref.delete()));
      await f.delete();
      deleted += 1;
    }
    logger.info(`reapBillScans: deleted ${deleted} abandoned bill scan(s) of ${files.length} scanned`);
  },
);
