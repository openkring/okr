import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

interface GenerateDunningPdfData {
  invoiceKey: string;
  dunningLevel: 1 | 2 | 3;
  tenantId: string;
}

export const generateDunningPdf = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<GenerateDunningPdfData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { invoiceKey, dunningLevel, tenantId } = request.data;
    if (!invoiceKey || !tenantId) throw new HttpsError('invalid-argument', 'invoiceKey and tenantId required');

    const db = admin.firestore();
    const invoiceSnap = await db.collection('invoices').doc(invoiceKey).get();
    if (!invoiceSnap.exists) throw new HttpsError('not-found', `Invoice ${invoiceKey} not found`);

    const pdfStub = Buffer.from(`%PDF-1.4 dunning-level-${dunningLevel} stub`).toString('base64');
    logger.info(`generateDunningPdf: generated level ${dunningLevel} dunning for invoice ${invoiceKey}`);
    return { pdf: pdfStub };
  }
);
