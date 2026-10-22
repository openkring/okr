import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FileTransferCollection, FileTransferEventCollection, FileTransferModel } from '@okr/shared-models';

import { privateBucket } from '../_storage/private-bucket';
import { fileTransferPrefix } from './file-transfer-storage';

/** An upload that was never sent is dropped after this long (its resumable session is long dead). */
const UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ReapAction = 'expire' | 'dropUpload' | 'none';

/**
 * What the reaper does with one transfer (spec 1.115 §4.5). Pure: the two queries are single-field
 * (`state`), so expiry and age are decided here, not in a composite index. Unparsable dates → 'none'.
 */
export function reapAction(t: Pick<FileTransferModel, 'state' | 'expiresAt' | 'createdAt'>, nowIso: string): ReapAction {
  const now = Date.parse(nowIso);
  if (t.state === 'open') {
    const exp = Date.parse(t.expiresAt);
    return Number.isFinite(exp) && Number.isFinite(now) && exp <= now ? 'expire' : 'none';
  }
  if (t.state === 'uploading') {
    const created = Date.parse(t.createdAt);
    return Number.isFinite(created) && Number.isFinite(now) && now - created > UPLOAD_MAX_AGE_MS ? 'dropUpload' : 'none';
  }
  return 'none';
}

/**
 * Hourly lifecycle sweep: open transfers past `expiresAt` → files deleted, state 'expired', event;
 * uploads older than 24 h → files and doc deleted. The transfer doc and its events of finished
 * transfers are kept (audit). One transfer's failure never stops the rest.
 */
export const reapFileTransfers = onSchedule(
  { region: 'europe-west6', schedule: 'every 60 minutes', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    const nowIso = new Date().toISOString();
    let expired = 0;
    let dropped = 0;
    for (const state of ['open', 'uploading'] as const) {
      const snap = await db.collection(FileTransferCollection).where('state', '==', state).get();
      for (const doc of snap.docs) {
        try {
          const t = { ...new FileTransferModel(''), ...(doc.data() as Partial<FileTransferModel>), okey: doc.id } as FileTransferModel;
          const action = reapAction(t, nowIso);
          if (action === 'none') continue;
          const tenantId = t.tenants[0] ?? '';
          if (!tenantId) { logger.warn(`reapFileTransfers: ${doc.id} has no tenant — skipped`); continue; }
          if (action === 'expire') {
            // re-read inside the transaction: an end (or another reaper run) may have won the race
            const flipped = await db.runTransaction(async (tx) => {
              const fresh = (await tx.get(doc.ref)).data() as Partial<FileTransferModel> | undefined;
              if (!fresh || fresh.state !== 'open') return false;
              tx.update(doc.ref, { state: 'expired' });
              tx.set(db.collection(FileTransferEventCollection).doc(), {
                tenants: t.tenants, transferKey: doc.id, senderKey: t.senderKey, type: 'expired',
                recipientId: '', actorKey: '', fileIndex: -1, at: nowIso,
              });
              return true;
            });
            if (!flipped) continue;
            await privateBucket().deleteFiles({ prefix: fileTransferPrefix(tenantId, doc.id) });
            expired++;
          } else {
            // only a still-'uploading' doc is dropped (a send may have opened it meanwhile)
            const gone = await db.runTransaction(async (tx) => {
              const fresh = (await tx.get(doc.ref)).data() as Partial<FileTransferModel> | undefined;
              if (!fresh || fresh.state !== 'uploading') return false;
              tx.delete(doc.ref);
              return true;
            });
            if (!gone) continue;
            await privateBucket().deleteFiles({ prefix: fileTransferPrefix(tenantId, doc.id) });
            dropped++;
          }
        } catch (err) {
          logger.error(`reapFileTransfers: ${doc.id} failed`, err);
        }
      }
    }
    logger.info(`reapFileTransfers: ${expired} expired, ${dropped} dropped uploads`);
  },
);
