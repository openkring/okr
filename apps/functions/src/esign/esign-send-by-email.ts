// apps/functions/src/esign/esign-send-by-email.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import axios from 'axios';
import { sendEmailViaProvider } from '../auth/email-transport';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

const mailtrapApiKey = defineSecret('MAILTRAP_APIKEY');
// EMAIL_FROM must be an address on the verified Mailtrap sending domain (e.g. app@seeclub.org).
const emailFrom      = defineSecret('EMAIL_FROM');

export const esignSendByEmail = onCall<{
  esignId: string;
  recipients: string[];
  subject?: string;
  body?: string;
  includeSignedPdf: boolean;
}>(
  {
    region: REGION,
    enforceAppCheck: true,
    secrets: [...ALL_ESIGN_SECRETS, mailtrapApiKey, emailFrom],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const { esignId, recipients, subject, body, includeSignedPdf } = request.data;
    if (!esignId || !recipients?.length) {
      throw new HttpsError('invalid-argument', 'esignId and recipients required');
    }

    const db = getFirestore();
    const snap = await db.collection(EsignCollection).doc(esignId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Signing process not found');
    const record = snap.data() as { deepsignDocumentId: string; documentName: string };

    const emailHtml = body ?? `<p>Bitte finden Sie das Dokument <strong>${record.documentName}</strong> im Anhang.</p>`;

    if (includeSignedPdf) {
      const token = await getDeepSignAccessToken(
        deepsignClientId.value(), deepsignClientSecret.value(),
        deepsignServiceUsername.value(), deepsignServicePassword.value(),
      );
      const detailsResponse = await axios.get(
        `${DEEPSIGN_API_BASE}/documents/${record.deepsignDocumentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const documentUrl: string = detailsResponse.data.documentUrl;
      const pdfResponse = await axios.get<ArrayBuffer>(documentUrl, { responseType: 'arraybuffer' });
      const pdfBuffer = Buffer.from(pdfResponse.data);

      await sendEmailViaProvider('mailtrap_api', {
        from: emailFrom.value(),
        to: recipients,
        subject: subject ?? `Dokument: ${record.documentName}`,
        html: emailHtml,
        attachments: [{ filename: `${record.documentName}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
      });
    } else {
      await sendEmailViaProvider('mailtrap_api', {
        from: emailFrom.value(),
        to: recipients,
        subject: subject ?? `Dokument: ${record.documentName}`,
        html: emailHtml,
      });
    }

    await db.collection(EsignCollection).doc(esignId).update({
      sendLog: FieldValue.arrayUnion({
        sentAt: Timestamp.now(),
        sentBy: request.auth.uid,
        recipients,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info('esignSendByEmail: sent', { esignId, recipients });
    return { success: true };
  },
);
