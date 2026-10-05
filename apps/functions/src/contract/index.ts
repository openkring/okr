import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

import { ContractCollection, ContractDocumentCollection, ContractDocumentRef, ContractModel } from '@okr/shared-models';
import { getTodayStr } from '@okr/shared-util-core';

import { emitEvent } from '../workflow/emit';
import { IMGIX_PRIVATE_HOST, signImgixUrl } from '../_storage/imgix-sign';
import { privateBucket } from '../_storage/private-bucket';
import { planContractScan, scanEventTarget } from './contract-scan';
import {
  ALLOWED_CONTRACT_MIME_TYPES, buildContractDocumentStamp, canReadContractData, contractDocumentPath,
  MAX_CONTRACT_FILE_BYTES, needsRestamp, upsertDocumentRef,
} from './contract-document.util';
import { loadViewer, loadWritableContract } from './caller';

const REGION = 'europe-west6';
const CALLABLE = { region: REGION, enforceAppCheck: true, cors: true } as const;
/** Secure-URL token of the private imgix source (reads only the private bucket). */
const imgixPrivateToken = defineSecret('IMGIX_PRIVATE_TOKEN');
const URL_TTL_MS = 10 * 60 * 1000;
const UPLOAD_TTL_MS = 15 * 60 * 1000;
const DOC_ROLES = ['contract', 'annex', 'amendment', 'correspondence', 'other'];
const DOC_STATES = ['draft', 'redline', 'final', 'signed'];

/** Storage path for a contract file; an invalid key is the caller's fault, not an internal error. */
function filePath(tenantId: string, contractKey: string, docKey: string, fileName: string, cf: string): string {
  try {
    return contractDocumentPath(tenantId, contractKey, docKey, fileName);
  } catch {
    throw new HttpsError('invalid-argument', `${cf}: invalid key`);
  }
}

/** Daily deadline scan (spec 1.5 §6.2). One tenant's failure never stops the others. */
export const scanContractDeadlines = onSchedule(
  { region: REGION, schedule: 'every day 06:00', timeZone: 'Europe/Zurich' },
  async () => {
    const db = getFirestore();
    const today = getTodayStr();
    const configs = await db.collection('app-config').get();
    for (const cfg of configs.docs) {
      const tenantId = cfg.id;
      try {
        const snap = await db.collection(ContractCollection)
          .where('tenants', 'array-contains', tenantId).where('isArchived', '==', false)
          .where('state', 'in', ['active', 'noticeGiven']).get();
        for (const doc of snap.docs) {
          // One malformed contract (e.g. an unparsable date) must not stop the rest of the tenant.
          try {
            // Firestore reads skip class defaults: merge over the model defaults so legacy docs are safe.
            const c = { ...new ContractModel(tenantId), ...(doc.data() as Partial<ContractModel>), okey: doc.id } as ContractModel;
            const { patch, events } = planContractScan(c, today);
            if (Object.keys(patch).length > 0) await doc.ref.update(patch);
            for (const e of events) {
              const { relatedKey, params } = scanEventTarget(doc.id, e);
              await emitEvent(e.event, tenantId, relatedKey, {
                personKey: c.responsible?.key ?? '', subjectName: c.name, params,
              });
            }
          } catch (e) {
            logger.error(`scanContractDeadlines: tenant=${tenantId} contract=${doc.id} failed`, e);
          }
        }
      } catch (e) {
        logger.error(`scanContractDeadlines: tenant=${tenantId} failed`, e);
      }
    }
  },
);

/** Keeps file access in step with the contract (spec 1.5 §5.3): a removed party loses file access. */
export const onContractWritten = onDocumentWritten({ document: `${ContractCollection}/{id}`, region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!needsRestamp(before, after) || !after) return;
  const db = getFirestore();
  const docs = await db.collection(ContractDocumentCollection).where('contractKey', '==', event.params.id).get();
  const stamp = buildContractDocumentStamp(after);
  for (let i = 0; i < docs.docs.length; i += 400) {
    const batch = db.batch();
    docs.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, stamp));
    await batch.commit();
  }
  logger.info(`onContractWritten: restamped ${docs.size} file(s) of contract ${event.params.id}`);
});

/** Step 1 of an upload (spec 1.5 §7.1): a short-lived V4 signed PUT URL into the private bucket and a fresh docKey. */
export const requestContractUpload = onCall(CALLABLE, async (
  request: CallableRequest<{ contractKey?: string; fileName?: string; mimeType?: string; size?: number }>,
): Promise<{ docKey: string; uploadUrl: string }> => {
  const cf = 'requestContractUpload';
  const viewer = await loadViewer(request, cf);
  const { contractKey = '', fileName = '', mimeType = '', size = 0 } = request.data ?? {};
  await loadWritableContract(viewer, contractKey, cf);
  if (!ALLOWED_CONTRACT_MIME_TYPES.includes(mimeType)) throw new HttpsError('invalid-argument', `${cf}: file type not allowed`);
  if (!(typeof size === 'number' && size > 0 && size <= MAX_CONTRACT_FILE_BYTES)) throw new HttpsError('invalid-argument', `${cf}: file too large`);
  const docKey = getFirestore().collection(ContractDocumentCollection).doc().id;
  const path = filePath(viewer.tenantId, contractKey, docKey, String(fileName), cf);
  const [uploadUrl] = await privateBucket().file(path).getSignedUrl({
    version: 'v4', action: 'write', expires: Date.now() + UPLOAD_TTL_MS, contentType: mimeType,
  });
  return { docKey, uploadUrl };
});

/**
 * Step 2 of an upload (spec 1.5 §7.1): verifies the object, hashes it (SHA-256), writes the
 * contract-documents doc stamped like the contract, and appends or replaces the ContractDocumentRef.
 */
export const registerContractDocument = onCall(CALLABLE, async (request: CallableRequest<{
  contractKey?: string; docKey?: string; fileName?: string; role?: string; title?: string; docState?: string; priorVersionKey?: string;
}>): Promise<{ ref: ContractDocumentRef }> => {
  const cf = 'registerContractDocument';
  const viewer = await loadViewer(request, cf);
  const d = request.data ?? {};
  const contractKey = String(d.contractKey ?? '');
  const docKey = String(d.docKey ?? '');
  const fileName = String(d.fileName ?? '');
  const { ref: contractRef } = await loadWritableContract(viewer, contractKey, cf);
  if (!DOC_ROLES.includes(d.role ?? '') || !DOC_STATES.includes(d.docState ?? '')) throw new HttpsError('invalid-argument', `${cf}: role/docState`);
  const path = filePath(viewer.tenantId, contractKey, docKey, fileName, cf);
  const db = getFirestore();
  const prior = String(d.priorVersionKey ?? '');
  let priorVersion = 0;
  if (prior) {
    const priorSnap = await db.collection(ContractDocumentCollection).doc(prior).get();
    if (priorSnap.get('contractKey') !== contractKey) throw new HttpsError('invalid-argument', `${cf}: prior version not in this contract`);
    priorVersion = Number(priorSnap.get('version') ?? 0) || 0;
  }
  const file = privateBucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('failed-precondition', `${cf}: upload missing`);
  const [meta] = await file.getMetadata();
  const mimeType = String(meta.contentType ?? '');
  const size = Number(meta.size ?? 0);
  // A signed PUT URL cannot cap the size; enforce type and size here and drop an offending object.
  if (!ALLOWED_CONTRACT_MIME_TYPES.includes(mimeType) || !(size > 0 && size <= MAX_CONTRACT_FILE_BYTES)) {
    await file.delete({ ignoreNotFound: true });
    throw new HttpsError('invalid-argument', `${cf}: file type or size not allowed`);
  }
  const hash = await new Promise<string>((resolve, reject) => {
    const h = createHash('sha256');
    file.createReadStream().on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
  const today = getTodayStr();
  const title = String(d.title ?? '').slice(0, 120) || fileName;
  const newRef: ContractDocumentRef = {
    docKey, role: d.role as ContractDocumentRef['role'], title, docState: d.docState as ContractDocumentRef['docState'],
  };
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(contractRef)).data();
    if (!fresh) throw new HttpsError('not-found', `${cf}: contract not found`);
    // Access fields come from the strict-safe stamp of the contract as read INSIDE the transaction
    // (exactly as onContractWritten restamps them): a party removed or a confidentiality raised
    // since the pre-check read must not leak into the new file's access fields.
    const docData = {
      isArchived: false, index: `n:${title}`, tags: '', folderKeys: [],
      fullPath: path, description: '', title, altText: title, type: 'legal', source: 'storage', credit: '', url: '',
      mimeType, size,
      authorKey: viewer.personKey, authorName: '', dateOfDocCreation: today, dateOfDocLastUpdate: today,
      locationKey: '', hash, priorVersionKey: prior, version: String(priorVersion + 1), renderings: [],
      contractKey,
      ...buildContractDocumentStamp(fresh),
    };
    tx.set(db.collection(ContractDocumentCollection).doc(docKey), docData);
    tx.update(contractRef, { documents: upsertDocumentRef((fresh['documents'] as ContractDocumentRef[]) ?? [], newRef, prior) });
  });
  logger.info(`${cf}: registered ${docKey} on contract ${contractKey} (tenant ${viewer.tenantId})`);
  return { ref: newRef };
});

/**
 * Signed, short-lived links to contract files (spec 1.5 §7.2), sibling of signFinanceDocuments.
 * §5.1 is evaluated per document; unreadable documents are silently left out.
 */
export const signContractDocuments = onCall({ ...CALLABLE, secrets: [imgixPrivateToken] }, async (
  request: CallableRequest<{ documentKeys?: string[] }>,
): Promise<{ documents: { key: string; name: string; mimeType: string; size: number; url: string; thumbnailUrl: string }[] }> => {
  const cf = 'signContractDocuments';
  const viewer = await loadViewer(request, cf);
  const raw = Array.isArray(request.data?.documentKeys) ? request.data.documentKeys : [];
  const keys = [...new Set(raw.filter((k): k is string => typeof k === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(k)))].slice(0, 50);
  if (keys.length === 0) return { documents: [] };
  const db = getFirestore();
  const snaps = await db.getAll(...keys.map((k) => db.collection(ContractDocumentCollection).doc(k)));
  const expires = Date.now() + URL_TTL_MS;
  const readable = snaps.filter((s) => canReadContractData(viewer, s.data()) && s.get('fullPath'));
  const documents = await Promise.all(readable.map(async (s) => {
    const path = String(s.get('fullPath'));
    const name = String(s.get('title') || s.id);
    const mimeType = String(s.get('mimeType') ?? '');
    const [url] = await privateBucket().file(path).getSignedUrl({
      version: 'v4', action: 'read', expires, responseDisposition: `inline; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"`,
    });
    const thumb = mimeType.startsWith('image/') || mimeType === 'application/pdf';
    const thumbnailUrl = thumb
      ? signImgixUrl(IMGIX_PRIVATE_HOST, imgixPrivateToken.value(), path,
        { w: 240, h: 240, fit: 'crop', crop: 'top', fm: 'jpg', expires: Math.floor(expires / 1000) })
      : '';
    return { key: s.id, name, mimeType, size: Number(s.get('size') ?? 0), url, thumbnailUrl };
  }));
  logger.info(`${cf}: signed ${documents.length}/${keys.length} for tenant ${viewer.tenantId}`);
  return { documents };
});

export { requestContract } from './request-contract';
export { getContractRequestStatus } from './contract-request-status';
