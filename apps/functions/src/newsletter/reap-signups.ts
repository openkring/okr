// apps/functions/src/newsletter/reap-signups.ts
//
// Nightly cleanup of pending newsletter sign-ups (spec 1.169 §5.2, Task 8). A signup is deleted once its
// confirmation link has expired, and every confirmed signup is deleted: confirming already turned it into a
// person and a subscription (Task 6), so the doc is only a leftover. Counts are logged, never addresses.

import { logger } from 'firebase-functions/v2';
import { getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';

import { toStoreDateTime } from '../srv/zurich-time';
import { NewsletterSignupCollection } from './types';

/** Firestore allows at most 500 writes per batch. */
const BATCH_SIZE = 500;

/** Deletes expired and confirmed `newsletterSignups` docs and returns how many were deleted. */
export async function reapNewsletterSignups(db: Firestore, now: Date): Promise<number> {
  const collection = db.collection(NewsletterSignupCollection);
  const nowStr = toStoreDateTime(now);

  const [expired, confirmed] = await Promise.all([
    collection.where('expiresAt', '<', nowStr).get(),
    collection.where('state', '==', 'confirmed').get(),
  ]);

  // a doc can match both queries; delete each one once
  const refs = new Map<string, DocumentReference>();
  for (const d of [...expired.docs, ...confirmed.docs]) refs.set(d.ref.path, d.ref);

  const all = [...refs.values()];
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const ref of all.slice(i, i + BATCH_SIZE)) batch.delete(ref);
    await batch.commit();
  }
  return all.length;
}

/** Scheduled entry point (NIGHTLY_JOBS): removes expired and confirmed sign-ups. */
export async function runNewsletterSignupReap(now: Date): Promise<void> {
  const deleted = await reapNewsletterSignups(getFirestore(), now);
  logger.info(`newsletterSignupReap: deleted ${deleted} sign-up(s)`);
}
