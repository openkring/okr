import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const MIN_INTERVAL_MS = {
  admin: 60_000,        // 1 per minute
  regular: 5 * 60_000, // 1 per 5 minutes
};

/**
 * Throws resource-exhausted if the user has generated too recently.
 * isAdmin is true when the user has admin or contentAdmin custom claim.
 */
export async function checkRateLimit(userId: string, isAdmin: boolean): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('_rateLimits').doc(`docGen_${userId}`);
  const limit = isAdmin ? MIN_INTERVAL_MS.admin : MIN_INTERVAL_MS.regular;

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now = Date.now();
    if (snap.exists) {
      const data = snap.data();
      const lastAt = data ? (data['lastAt'] as Timestamp).toMillis() : 0;
      const elapsed = now - lastAt;
      if (elapsed < limit) {
        const retryAfter = Math.round((limit - elapsed) / 1000);
        throw new HttpsError(
          'resource-exhausted',
          `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
          { retryAfterSeconds: retryAfter }
        );
      }
    }
    tx.set(ref, { lastAt: Timestamp.now(), userId });
  });
}
