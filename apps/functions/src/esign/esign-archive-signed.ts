// apps/functions/src/esign/esign-archive-signed.ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, DEEPSIGN_API_BASE, REGION,
  getDeepSignAccessToken,
  deepsignClientId, deepsignClientSecret,
  deepsignServiceUsername, deepsignServicePassword,
} from './shared';
import { EsignCollection } from '@bk2/shared-models';

export const esignArchiveSigned = onDocumentUpdated(
  { document: `${EsignCollection}/{esignId}`, region: REGION, secrets: ALL_ESIGN_SECRETS },
  async (event) => {
    const before = event.data?.before?.data() as { documentStatus: string } | undefined;
    const after  = event.data?.after?.data()  as {
      documentStatus: string;
      deepsignDocumentId: string;
      tenantId: string;
      signedPdfPath?: string;
    } | undefined;

    // Only trigger on transition to 'signed'
    if (!after || after.documentStatus !== 'signed') return;
    if (before?.documentStatus === 'signed') return;
    if (after.signedPdfPath) return; // already archived

    const { esignId } = event.params;

    try {
      const token = await getDeepSignAccessToken(
        deepsignClientId.value(), deepsignClientSecret.value(),
        deepsignServiceUsername.value(), deepsignServicePassword.value(),
      );

      const detailsResponse = await axios.get(
        `${DEEPSIGN_API_BASE}/documents/${after.deepsignDocumentId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const documentUrl: string = detailsResponse.data.documentUrl;
      const pdfResponse = await axios.get<ArrayBuffer>(documentUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(pdfResponse.data);

      const signedPdfPath = `tenants/${after.tenantId}/esign/${esignId}/signed.pdf`;
      await getStorage().bucket().file(signedPdfPath).save(buffer, {
        metadata: { contentType: 'application/pdf' },
      });

      await getFirestore().collection(EsignCollection).doc(esignId).update({
        signedPdfPath,
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info('esignArchiveSigned: archived', { esignId, signedPdfPath });
    } catch (err) {
      logger.error('esignArchiveSigned: failed to archive', { esignId, err });
    }
  },
);
