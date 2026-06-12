// apps/functions/src/esign/esign-resend-invitation.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken, assertEsignAccess,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export const esignResendInvitation = onCall<{ esignId: string; signeeId: string }>(
  { region: REGION, enforceAppCheck: true, secrets: ALL_ESIGN_SECRETS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId, signeeId } = request.data;
    if (!esignId || !signeeId) throw new HttpsError('invalid-argument', 'esignId and signeeId required');

    const db = getFirestore();
    const snap = await db.collection(EsignCollection).doc(esignId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');

    const record = snap.data() as { deepsignDocumentId: string; tenantId?: string; ownerUserId?: string };
    await assertEsignAccess(request.auth.uid, record);

    const token = await getDeepSignAccessToken(
      deepsignClientId.value(), deepsignClientSecret.value(),
      deepsignServiceUsername.value(), deepsignServicePassword.value(),
    );

    await axios.post(
      `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}/signees/${signeeId}/resend-invitation`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return { success: true };
  },
);
