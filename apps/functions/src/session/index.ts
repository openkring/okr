// apps/functions/src/session/index.ts
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getTodayStr, DateFormat, subDuration } from '@bk2/shared-util-core';

const REGION = 'europe-west6';
const SESSION_COLLECTION = 'sessions';

/**
 * HTTPS endpoint called via navigator.sendBeacon on iOS Safari visibilitychange.
 * Body: { sessionKey: string, tenantId: string }
 */
export const endSession = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    const { sessionKey, tenantId } = req.body as { sessionKey?: string; tenantId?: string };
    if (!sessionKey || !tenantId) {
      res.status(400).send('Missing sessionKey or tenantId');
      return;
    }
    try {
      const db = getFirestore();
      const ref = db.collection(SESSION_COLLECTION).doc(sessionKey);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).send('Session not found');
        return;
      }
      const data = snap.data()!;
      if (!data['isActive']) {
        res.status(200).send('Already closed');
        return;
      }
      const tenants = data['tenants'] as string[] | undefined;
      if (!Array.isArray(tenants) || !tenants.includes(tenantId)) {
        res.status(403).send('Forbidden');
        return;
      }
      const endedAt = getTodayStr(DateFormat.StoreDateTime);
      const durationSeconds = calcDurationSeconds(data['startedAt'] as string, endedAt);
      await ref.update({ isActive: false, endedAt, durationSeconds });
      logger.info(`endSession: closed session ${sessionKey}`);
      res.status(200).send('OK');
    } catch (err) {
      logger.error('endSession: error', err);
      res.status(500).send('Internal error');
    }
  }
);

/**
 * Scheduled cleanup: marks orphaned sessions (isActive=true, lastSeenAt older than 30 min) as ended.
 * Runs every 30 minutes.
 */
export const cleanupOrphanSessions = onSchedule(
  { schedule: 'every 30 minutes', region: REGION },
  async () => {
    const db = getFirestore();
    const thresholdStr = subDuration(getTodayStr(DateFormat.StoreDateTime), { minutes: 30 }, DateFormat.StoreDateTime);

    const snap = await db.collection(SESSION_COLLECTION)
      .where('isActive', '==', true)
      .where('lastSeenAt', '<', thresholdStr)
      .get();

    if (snap.empty) {
      logger.info('cleanupOrphanSessions: no orphans found');
      return;
    }

    const BATCH_SIZE = 500;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const doc of chunk) {
        const data = doc.data();
        const endedAt = data['lastSeenAt'] as string;
        const durationSeconds = calcDurationSeconds(data['startedAt'] as string, endedAt);
        batch.update(doc.ref, { isActive: false, endedAt, durationSeconds });
      }
      await batch.commit();
    }
    logger.info(`cleanupOrphanSessions: closed ${snap.size} orphaned sessions`);
  }
);

function calcDurationSeconds(startedAt: string, endedAt: string): number {
  if (!startedAt || !endedAt || startedAt.length < 14 || endedAt.length < 14) return 0;
  const parse = (sdt: string): number => {
    const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
    const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
    const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
    return new Date(y, mo, d, h, m, s).getTime();
  };
  return Math.max(0, Math.floor((parse(endedAt) - parse(startedAt)) / 1000));
}
