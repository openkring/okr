// apps/functions/src/esign/esign-delete.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, REGION,
  getDeepSignAccessToken, getEsignApiBase, assertEsignAccess,
} from './shared';
import { EsignCollection, EsignAuditCollection } from '@bk2/shared-models';

export const esignDelete = onCall<{ esignId: string; reason?: string }>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId, reason } = request.data;
    if (!esignId) throw new HttpsError('invalid-argument', 'esignId required');

    const db = getFirestore();
    const docRef = db.collection(EsignCollection).doc(esignId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');

    const record = snap.data() as {
      deepsignDocumentId: string;
      documentStatus: string;
      storagePath: string;
      signedPdfPath?: string;
      tenantId?: string;
      ownerUserId?: string;
    };
    await assertEsignAccess(request.auth.uid, record);

    const status = record.documentStatus;
    let token: string | null = null;

    const apiBase = getEsignApiBase();
    const needsToken = !['uploading', 'error'].includes(status);
    if (needsToken) {
      token = await getDeepSignAccessToken();
    }

    // Status-dependent cleanup on DeepSign side
    if (status === 'in-progress' && token) {
      await axios.put(
        `${apiBase}/documents/${record.deepsignDocumentId}/withdraw`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Poll once to confirm withdrawn
      await axios.get(
        `${apiBase}/documents/${record.deepsignDocumentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }

    if (!['uploading', 'error'].includes(status) && token) {
      try {
        await axios.delete(
          `${apiBase}/documents/${record.deepsignDocumentId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (err) {
        logger.warn('esignDelete: DeepSign DELETE failed (best-effort)', { esignId, err });
      }
    }

    // Delete Storage objects
    const bucket = getStorage().bucket();
    const deleteStorageFile = async (path: string) => {
      try { await bucket.file(path).delete(); } catch { /* ignore if not found */ }
    };

    await deleteStorageFile(record.storagePath);
    if (record.signedPdfPath) await deleteStorageFile(record.signedPdfPath);

    // Write audit log + delete esignList record in one transaction
    await db.runTransaction(async (tx) => {
      const auditRef = db
        .collection(EsignAuditCollection)
        .doc(record.tenantId)
        .collection('deletions')
        .doc(esignId);
      tx.set(auditRef, {
        esignId,
        deletedBy: request.auth!.uid,
        deletedAt: Timestamp.now(),
        priorStatus: status,
        ...(reason ? { reason } : {}),
      });
      tx.delete(docRef);
    });

    logger.info('esignDelete: deleted', { esignId, priorStatus: status });
    return { success: true };
  },
);
