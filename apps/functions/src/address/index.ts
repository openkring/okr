import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWriteStream } from 'fs';

import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import PDFDocument from 'pdfkit';
import { SwissQRBill } from 'swissqrbill/pdf';
import type { Data } from 'swissqrbill/types';

export type { Data as QrBillData };

export interface GenerateQrBillRequest {
  tenantId: string;
  addressBkey: string;
  data: Data;
}

export interface GenerateQrBillResponse {
  storagePath: string;
}

/**
 * Generates a Swiss QR bill PDF and uploads it to Firebase Storage.
 * The client builds the swissqrbill Data structure (creditor, debtor, amount, currency, reference)
 * and passes it along with tenantId and addressBkey.
 * Returns the storagePath; the client calls getDownloadURL to get the actual URL.
 */
export const generateQrBill = onCall<GenerateQrBillRequest, Promise<GenerateQrBillResponse>>(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { tenantId, addressBkey, data } = request.data;

    if (!tenantId || !addressBkey) {
      throw new HttpsError('invalid-argument', 'tenantId and addressBkey are required');
    }
    if (!data?.creditor || !data?.currency) {
      throw new HttpsError('invalid-argument', 'data.creditor and data.currency are required');
    }

    const fileName = `qr-bill-${Date.now()}.pdf`;
    const tempPath = path.join(os.tmpdir(), fileName);

    logger.info('generateQrBill: generating PDF', { tenantId, addressBkey, fileName });

    try {
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false });
        const stream = createWriteStream(tempPath);
        doc.pipe(stream);

        const qrBill = new SwissQRBill(data);
        qrBill.attachTo(doc);
        doc.end();

        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const storagePath = `tenant/${tenantId}/address/${addressBkey}/ezs/${fileName}`;
      const bucket = getStorage().bucket();

      await bucket.upload(tempPath, {
        destination: storagePath,
        metadata: { contentType: 'application/pdf' },
      });

      logger.info('generateQrBill: PDF uploaded', { storagePath });
      return { storagePath };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('generateQrBill: failed', { tenantId, addressBkey, message });
      throw new HttpsError('internal', message);
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
);
