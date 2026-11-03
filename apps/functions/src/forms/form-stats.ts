import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { Firestore } from 'firebase-admin/firestore';

import { FormStatsCollection } from '@okr/shared-models';
import type { AcceptanceSettings } from '@okr/shared-util-core';

/**
 * The places of a form (1.125 B, spec §11): `formStats/{statsId}.responseCount` counts the accepted
 * (non-spam) responses. Written only here (rules deny every client write); a cancelled or denied
 * response does not free its place (v1). No personal data — only the count and the tenant.
 */

/** Pure: may one more response take a place? `max = 0` is unlimited and still counts. */
export function decideSlot(current: number | undefined, max: number): { accept: boolean; next: number } {
  const count = typeof current === 'number' && Number.isFinite(current) && current > 0 ? current : 0;
  const limit = typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : 0;
  if (limit > 0 && count >= limit) return { accept: false, next: count };
  return { accept: true, next: count + 1 };
}

function countOf(data: Record<string, unknown> | undefined): number {
  const n = data?.['responseCount'];
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/** The current count (0 for a new or malformed counter) — for the availability check before a submit. */
export async function readResponseCount(db: Firestore, statsId: string): Promise<number> {
  const snap = await db.collection(FormStatsCollection).doc(statsId).get();
  return snap.exists ? countOf(snap.data()) : 0;
}

/**
 * Spam: runs `write` without touching the count (no tell: a full form answers a bot like any other).
 * Otherwise a transaction on formStats/{statsId} takes a place (refuses with
 * HttpsError('failed-precondition', 'form-full')), then `write` runs; if it throws, the place is
 * given back (never below 0) and the error rethrown.
 */
export async function persistWithSlot(
  db: Firestore,
  settings: AcceptanceSettings,
  tenantId: string,
  isSpam: boolean,
  write: () => Promise<string>,
): Promise<string> {
  if (isSpam) return write();

  const ref = db.collection(FormStatsCollection).doc(settings.statsId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : undefined;
    const slot = decideSlot(data === undefined ? undefined : countOf(data), settings.maxResponses);
    if (!slot.accept) throw new HttpsError('failed-precondition', 'form-full');
    // never overwrite `tenants`: a form shared by several tenants keeps all of them (union, read in this transaction)
    const tenants = Array.isArray(data?.['tenants']) ? (data?.['tenants'] as unknown[]).filter((t): t is string => typeof t === 'string') : [];
    const patch: Record<string, unknown> = { responseCount: slot.next };
    if (!tenants.includes(tenantId)) patch['tenants'] = [...tenants, tenantId];
    tx.set(ref, patch, { merge: true });
  });

  try {
    return await write();
  } catch (e) {
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // a counter removed meanwhile is not re-created (it would lack `tenants` and be unreadable for authors)
        if (!snap.exists) return;
        tx.update(ref, { responseCount: Math.max(0, countOf(snap.data()) - 1) });
      });
    } catch (giveBackError) {
      // the place stays taken (one too many counted) — the author can raise the limit
      logger.error(`persistWithSlot: could not give back the place of formStats/${settings.statsId}`, giveBackError);
    }
    throw e;
  }
}
