import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

// How long we wait for the Firestore connectivity probe before declaring the
// backend degraded. Kept short so an uptime probe never hangs on a stuck read.
const FIRESTORE_PROBE_TIMEOUT_MS = 4000;

/** Reject after `ms` so a hung dependency can never stall the health check. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Public, unauthenticated health check for external uptime monitoring
 * (BetterStack et al.). No App Check — probes send no credentials.
 *
 * URL: GET https://europe-west6-bkaiser-org.cloudfunctions.net/healthz
 *      (also reachable at /healthz on the scs-app hosting site via a rewrite)
 *
 * It does more than a liveness ping: it performs one cheap Firestore read so a
 * green check means "the backend is up AND can reach its database", which is the
 * unique signal a platform-level hosting monitor cannot give.
 *
 * Responses:
 *   200 { status: 'ok',       firestore: 'ok' }     — function up, Firestore reachable
 *   503 { status: 'degraded', firestore: 'error' }  — function up, Firestore unreachable
 */
export const healthz = onRequest(
  { region: 'europe-west6' },
  async (_req, res) => {
    // Never let a monitor cache a health result.
    res.set('Cache-Control', 'no-store');

    let firestoreOk = false;
    try {
      const db = getFirestore();
      // Cheapest possible connectivity probe: a single-doc read. We only care
      // that the round-trip to Firestore succeeds, not about the contents.
      await withTimeout(db.collection('app-config').limit(1).get(), FIRESTORE_PROBE_TIMEOUT_MS, 'firestore');
      firestoreOk = true;
    } catch (err) {
      logger.error('healthz: Firestore probe failed', { err });
    }

    const body = {
      status: firestoreOk ? 'ok' : 'degraded',
      firestore: firestoreOk ? 'ok' : 'error',
      region: 'europe-west6',
      timestamp: new Date().toISOString(),
    };

    res.status(firestoreOk ? 200 : 503).json(body);
  },
);
