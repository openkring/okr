import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

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

export type OrphanAction = 'delete' | 'keep';

/**
 * What the orphan sweep does with a transfer FOLDER in the bucket, given its doc (undefined = no
 * doc). Files of a missing/ended/expired transfer (or an upload past 24 h) are leftovers of a
 * delete that failed after the state commit; open transfers and fresh uploads are kept.
 */
export function orphanAction(doc: Pick<FileTransferModel, 'state' | 'createdAt'> | undefined, nowIso: string): OrphanAction {
  if (!doc || doc.state === 'ended' || doc.state === 'expired') return 'delete';
  if (doc.state === 'uploading') return reapAction({ state: 'uploading', expiresAt: '', createdAt: doc.createdAt }, nowIso) === 'dropUpload' ? 'delete' : 'keep';
  return 'keep';
}

/** Per tenant and run: at most this many transfer folders are inspected. */
const ORPHAN_SWEEP_MAX_PREFIXES = 500;

/** Deletes the folders of transfers that no longer need files (see orphanAction). One failure never stops the sweep. */
async function sweepOrphans(db: Firestore, nowIso: string): Promise<{ checked: number; deleted: number }> {
  let checked = 0;
  let deleted = 0;
  const tenants = await db.collection('app-config').listDocuments();
  for (const tenantRef of tenants) {
    try {
      const root = `tenant/${tenantRef.id}/file-transfer/`;
      const [, , apiResponse] = await privateBucket().getFiles({ prefix: root, delimiter: '/', autoPaginate: false, maxResults: ORPHAN_SWEEP_MAX_PREFIXES });
      const prefixes = ((apiResponse as { prefixes?: string[] } | undefined)?.prefixes ?? []).slice(0, ORPHAN_SWEEP_MAX_PREFIXES);
      for (const prefix of prefixes) {
        const key = prefix.slice(root.length).replace(/\/$/, '');
        if (!key) continue;
        checked++;
        try {
          const snap = await db.collection(FileTransferCollection).doc(key).get();
          const doc = snap.exists ? (snap.data() as Partial<FileTransferModel>) : undefined;
          const state = doc ? { state: doc.state ?? 'open', createdAt: doc.createdAt ?? '' } : undefined;
          if (orphanAction(state, nowIso) === 'delete') {
            await privateBucket().deleteFiles({ prefix });
            deleted++;
          }
        } catch (err) {
          logger.error(`reapFileTransfers: orphan sweep of ${prefix} failed`, err);
        }
      }
    } catch (err) {
      logger.error(`reapFileTransfers: orphan sweep of tenant ${tenantRef.id} failed`, err);
    }
  }
  return { checked, deleted };
}

/**
 * Hourly lifecycle sweep: open transfers past `expiresAt` → files deleted, state 'expired', event;
 * uploads older than 24 h → files and doc deleted. The transfer doc and its events of finished
 * transfers are kept (audit). One transfer's failure never stops the rest.
 */
export async function runFileTransferReap(): Promise<void> {
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
  const orphans = await sweepOrphans(db, nowIso).catch(err => {
    logger.error('reapFileTransfers: orphan sweep failed', err);
    return { checked: 0, deleted: 0 };
  });
  logger.info(`reapFileTransfers: ${expired} expired, ${dropped} dropped uploads, orphan sweep ${orphans.deleted}/${orphans.checked} folders deleted`);
}
