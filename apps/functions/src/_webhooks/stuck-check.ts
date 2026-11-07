// apps/functions/src/_webhooks/stuck-check.ts
//
// Nightly: a webhook row still `received` an hour after arrival means the
// trigger never finished it. Logged under the same text as a failed row so one
// alert covers both. Counts only: no row content, no IDs.
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { WebhookEventCollection } from './types';

const ONE_HOUR_MS = 60 * 60 * 1000;
const STUCK_LIMIT = 100;

/** Rows received before this are stuck: now minus one hour. */
export function stuckBefore(nowMs: number): Timestamp {
  return Timestamp.fromMillis(nowMs - ONE_HOUR_MS);
}

export async function runWebhookStuckCheck(): Promise<void> {
  const snap = await getFirestore()
    .collection(WebhookEventCollection)
    .where('state', '==', 'received')
    .where('receivedAt', '<', stuckBefore(Date.now()))
    .limit(STUCK_LIMIT)
    .get();
  if (snap.size > 0) logger.error('webhooks: event failed', { stuck: snap.size });
}
