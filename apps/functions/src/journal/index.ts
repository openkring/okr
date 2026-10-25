import { randomBytes } from 'node:crypto';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  JournalChange, JournalChangeCollection, JournalCollection, JournalPeerDoc, JournalPrivateCollection, JournalSectionCollection,
} from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { isJournalFileName, journalObjectPath, planEntityWrite, planFootprintSections, StoredRecord, mayOverwrite } from './apply-journal-change.logic';
import { requireJournalAuthor } from './journal-auth';

const REGION = 'europe-west6';
const URL_WINDOW_MS = 15 * 60 * 1000;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_FILES_PER_CALL = 50;

/**
 * Materialises one uploaded journal record (spec 1.113 §5.3): re-reads ALL records of the touched
 * entity, merges them with the device merge (@okr/travel-journal-util) and writes the result under
 * `journals/{jk}`. Runs one at a time (maxInstances 1, concurrency 1): each run reads every record
 * committed so far, so the last run of an entity always writes its newest state.
 */
export const applyJournalChange = onDocumentCreated(
  { document: `${JournalChangeCollection}/{id}`, region: REGION, maxInstances: 1, concurrency: 1 },
  async (event) => {
    const change = event.data?.data() as JournalChange | undefined;
    if (!change) return;
    const tenants = Array.isArray(change.tenants) ? change.tenants : [];
    if (tenants.length === 0) {
      logger.warn('applyJournalChange: record without tenants', { id: event.params['id'] });
      return;
    }
    const db = getFirestore();
    const snaps = await db.collection(JournalChangeCollection)
      .where('journalKey', '==', change.journalKey).where('entity', '==', change.entity).where('entityKey', '==', change.entityKey).get();
    const records: StoredRecord[] = snaps.docs.map((d) => {
      const data = d.data() as JournalChange;
      const uploadedAt = data.uploadedAt as unknown as Timestamp | undefined;
      return { change: data, uploadedAtMs: uploadedAt?.toMillis?.() ?? 0 };
    });
    const write = planEntityWrite(records, change.journalKey, change.entity, change.entityKey, tenants);
    if (!write) return;

    if (change.entity === 'section') {
      // the footprint of an archived block is only on the stored document
      const before = (await db.doc(write.path).get()).data();
      await db.doc(write.path).set(write.data);
      const footprintKey = (write.data['footprintKey'] ?? before?.['footprintKey']) as string | undefined;
      if (footprintKey) await writeFootprintSections(change.journalKey, footprintKey, tenants);
      return;
    }
    if (change.entity === 'footprint') {
      await db.doc(write.path).set(write.data);
      await writeFootprintSections(change.journalKey, change.entityKey, tenants);
      return;
    }
    await db.doc(write.path).set(write.data);
  },
);

async function writeFootprintSections(journalKey: string, footprintKey: string, tenants: string[]): Promise<void> {
  const db = getFirestore();
  const snaps = await db.collection(`${JournalCollection}/${journalKey}/${JournalSectionCollection}`).where('footprintKey', '==', footprintKey).get();
  const plan = planFootprintSections(journalKey, footprintKey, snaps.docs.map((d) => ({
    okey: d.id, order: d.data()['order'] as string | undefined, isArchived: d.data()['isArchived'] as boolean | undefined,
  })));
  // merge: the footprint doc may not exist yet when its first block arrives
  await db.doc(plan.path).set({ ...plan.data, tenants, journalKey }, { merge: true });
}

function fileNames(data: unknown): string[] {
  const files = (data as { files?: unknown } | undefined)?.files;
  if (!Array.isArray(files) || files.length > MAX_FILES_PER_CALL || !files.every(isJournalFileName)) {
    throw new HttpsError('invalid-argument', `files: up to ${MAX_FILES_PER_CALL} photo file names.`);
  }
  return [...new Set(files)];
}

export interface JournalPhotoUpload { file: string; done: boolean; url?: string; headers?: Record<string, string> }

/**
 * Signed v4 PUT URLs for a journal author's photo files in the private bucket (plan 4): image/jpeg,
 * at most 15 MB, bound by the headers the device must send verbatim. A file already in the bucket
 * comes back `done` (a retry after a lost response).
 */
export const prepareJournalPhotoUploads = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ uploads: JournalPhotoUpload[] }> => {
    checkAppCheckToken(request as never, 'prepareJournalPhotoUploads');
    checkAuthentication(request as never, 'prepareJournalPhotoUploads');
    const caller = await requireJournalAuthor(getFirestore(), request.auth?.uid ?? '', (request.data as { journalKey?: unknown })?.journalKey);
    const bucket = privateBucket();
    const headers = { 'Content-Type': 'image/jpeg', 'x-goog-content-length-range': `0,${MAX_PHOTO_BYTES}` };
    // `overwrite: true` re-uploads book maps (drawn again on every export, ruling R9); every other file is written once
    const overwrite = (request.data as { overwrite?: unknown } | undefined)?.overwrite;
    const uploads = await Promise.all(fileNames(request.data).map(async (file): Promise<JournalPhotoUpload> => {
      const object = bucket.file(journalObjectPath(caller.tenantId, caller.journalKey, file));
      const [exists] = await object.exists();
      if (exists && !mayOverwrite(file, overwrite)) return { file, done: true };
      const [url] = await object.getSignedUrl({
        version: 'v4', action: 'write', expires: Date.now() + URL_WINDOW_MS, contentType: headers['Content-Type'],
        extensionHeaders: { 'x-goog-content-length-range': headers['x-goog-content-length-range'] },
      });
      return { file, done: false, url, headers };
    }));
    return { uploads };
  },
);

/** Signed GET URLs (15 min) for a journal's photo files; files not (yet) in the bucket are left out. */
export const signJournalPhotos = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ urls: Record<string, string> }> => {
    checkAppCheckToken(request as never, 'signJournalPhotos');
    checkAuthentication(request as never, 'signJournalPhotos');
    const caller = await requireJournalAuthor(getFirestore(), request.auth?.uid ?? '', (request.data as { journalKey?: unknown })?.journalKey);
    const bucket = privateBucket();
    const urls: Record<string, string> = {};
    await Promise.all(fileNames(request.data).map(async (file) => {
      const object = bucket.file(journalObjectPath(caller.tenantId, caller.journalKey, file));
      const [exists] = await object.exists();
      if (!exists) return;
      [urls[file]] = await object.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + URL_WINDOW_MS });
    }));
    return { urls };
  },
);

/** The journal's peer secret for the P2P link (plan 5), created on first request. Authors only. */
export const ensureJournalPeerSecret = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ secret: string }> => {
    checkAppCheckToken(request as never, 'ensureJournalPeerSecret');
    checkAuthentication(request as never, 'ensureJournalPeerSecret');
    const db = getFirestore();
    const caller = await requireJournalAuthor(db, request.auth?.uid ?? '', (request.data as { journalKey?: unknown })?.journalKey);
    const ref = db.doc(`${JournalCollection}/${caller.journalKey}/${JournalPrivateCollection}/${JournalPeerDoc}`);
    const secret = await db.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data()?.['secret'];
      if (typeof existing === 'string' && existing !== '') return existing;
      const created = randomBytes(32).toString('base64');
      tx.set(ref, { secret: created, tenants: [caller.tenantId] });
      return created;
    });
    return { secret };
  },
);

export { exportJournalBook } from './book';
export { journalGuest, manageJournalGuest } from './guest';
export { notifyJournalGuests } from './notify';
