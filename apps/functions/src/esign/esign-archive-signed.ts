// apps/functions/src/esign/esign-archive-signed.ts
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import axios from 'axios';
import {
  ALL_ESIGN_SECRETS, REGION,
  getDeepSignAccessToken, getEsignApiBase,
} from './shared';
import { EsignCollection, MeetingCollection, MeetingModelName } from '@okr/shared-models';

export const esignArchiveSigned = onDocumentUpdated(
  { document: `${EsignCollection}/{esignId}`, region: REGION, secrets: ALL_ESIGN_SECRETS },
  async (event) => {
    const before = event.data?.before?.data() as { documentStatus: string } | undefined;
    const after  = event.data?.after?.data()  as {
      documentStatus: string;
      deepsignDocumentId: string;
      tenantId: string;
      signedPdfPath?: string;
      sourceRef?: string;
    } | undefined;

    // Only trigger on transition to 'signed'
    if (!after || after.documentStatus !== 'signed') return;
    if (before?.documentStatus === 'signed') return;

    const { esignId } = event.params;

    // A fully signed minutes PDF approves its meeting (3.20). Done before (and independently
    // of) the archiving below: the state of the meeting must not depend on DeepSign still
    // serving the signed file. `sourceRef` is 'meeting.<okey>', set by MeetingStore.
    if (after.sourceRef?.startsWith(`${MeetingModelName}.`)) {
      const meetingKey = after.sourceRef.slice(MeetingModelName.length + 1);
      try {
        await getFirestore().collection(MeetingCollection).doc(meetingKey).update({ state: 'approved' });
        logger.info('esignArchiveSigned: meeting approved', { esignId, meetingKey });
      } catch (err) {
        logger.error('esignArchiveSigned: failed to approve meeting', { esignId, meetingKey, err });
      }
    }

    if (after.signedPdfPath) return; // already archived

    try {
      const token = await getDeepSignAccessToken();

      const detailsResponse = await axios.get(
        `${getEsignApiBase()}/documents/${after.deepsignDocumentId}`,
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
