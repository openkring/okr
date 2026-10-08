import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { parseSwissQrBill } from '@okr/shared-util-core';

interface ParseQrInvoiceData {
  qrContent: string;
}

export interface ParsedQrInvoice {
  iban: string;
  amount: number;        // Rappen; 0 = amount left open
  currency: string;
  reference: string;     // '' for reference type NON
  creditorName: string;
  message: string;
  dueDate: string;       // always '': the Swiss QR-bill carries no due date (kept for the client contract)
}

export function parseQrContent(raw: string): ParsedQrInvoice {
  const qr = parseSwissQrBill(raw.trim());
  if (!qr) throw new Error('Not a valid Swiss QR bill');
  const amount = qr.amount ? Math.round(parseFloat(qr.amount) * 100) : 0;
  return {
    iban: qr.iban,
    amount: Number.isFinite(amount) ? amount : 0,
    currency: qr.currency || 'CHF',
    reference: qr.referenceType === 'NON' ? '' : qr.reference,
    creditorName: qr.creditorName,
    message: qr.message,
    dueDate: '',
  };
}

export const parseQrInvoice = onCall(
  // 256MiB (the v2 default), not 128MiB: every function loads the one shared
  // esbuild bundle at startup, so container memory tracks the whole codebase and
  // not this handler (which only parses a string). At 128MiB the container OOMed
  // during startup (135 MiB used) and the deploy failed its healthcheck.
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<ParseQrInvoiceData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { qrContent } = request.data;
    if (!qrContent) throw new HttpsError('invalid-argument', 'qrContent is required');
    try {
      const parsed = parseQrContent(qrContent);
      // Do NOT log the IBAN — PII (privacy inventory §7.2).
      logger.info(`parseQrInvoice: parsed QR invoice, amount ${parsed.amount}`);
      return parsed;
    } catch (err) {
      throw new HttpsError('invalid-argument', `Could not parse QR content: ${(err as Error).message}`);
    }
  }
);
