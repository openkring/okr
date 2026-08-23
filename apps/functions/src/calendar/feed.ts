import { randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

const FEEDS = 'calendarFeeds';

interface FeedDoc { uid: string; personKey: string; tenantId: string; createdAt: string }

/** 32 Zeichen Base62 aus 24 Zufallsbytes — serverseitig, damit die Entropie nie am Client hängt. */
function mintToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(32), b => alphabet[b % alphabet.length]).join('');
}

/**
 * Liefert das ICS-Abo-Token des Aufrufers und legt es an, falls keins existiert.
 * `{ regenerate: true }` widerruft das alte und gibt ein neues aus — bestehende Abos
 * hören damit sofort auf zu funktionieren.
 */
export const ensureCalendarFeedToken = onCall(
  { cors: true, region: 'europe-west6', enforceAppCheck: true },
  async (request): Promise<{ token: string }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Must be authenticated');

    const db = getFirestore();
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'No user document');
    const user = userSnap.data() as { personKey?: string; tenants?: string[]; isArchived?: boolean };
    if (user.isArchived) throw new HttpsError('permission-denied', 'User is archived');

    const regenerate = (request.data as { regenerate?: boolean } | undefined)?.regenerate === true;

    // Read-then-write must be atomic, or two concurrent `regenerate:true` calls can each read
    // the same `existing` snapshot before either commits and both mint a fresh token — leaving
    // two live tokens for one uid. A transaction closes that race (all reads before all writes).
    const token = await db.runTransaction(async tx => {
      const existing = await tx.get(db.collection(FEEDS).where('uid', '==', uid));

      if (!regenerate && !existing.empty) {
        return existing.docs[0].id;
      }

      for (const doc of existing.docs) tx.delete(doc.ref);
      const fresh = mintToken();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const doc: FeedDoc = {
        uid,
        personKey: user.personKey ?? '',
        tenantId: user.tenants?.[0] ?? '',
        createdAt: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      };
      tx.set(db.collection(FEEDS).doc(fresh), doc);
      return fresh;
    });

    // Nur ein Präfix ins Log — das Token selbst ist der Ausweis.
    logger.info('ensureCalendarFeedToken: issued', { uid, regenerate, tokenPrefix: token.slice(0, 6) });
    return { token };
  }
);
