// apps/functions/src/esign/esign-get-document-details.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export const esignGetDocumentDetails = onCall<{ esignId: string }>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId } = request.data;
    if (!esignId) throw new HttpsError('invalid-argument', 'esignId required');

    const db = getFirestore();
    const snap = await db.collection(EsignCollection).doc(esignId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');

    const record = snap.data() as { deepsignDocumentId: string; tenantId: string };
    const token = await getDeepSignAccessToken(
      deepsignClientId.value(), deepsignClientSecret.value(),
      deepsignServiceUsername.value(), deepsignServicePassword.value(),
    );

    const response = await axios.get(
      `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return { ...response.data, previewUrl: response.data.documentUrl };
  },
);
