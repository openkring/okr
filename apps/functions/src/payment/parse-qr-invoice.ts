import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

interface ParseQrInvoiceData {
  qrContent: string;
}

interface ParsedQrInvoice {
  iban: string;
  amount: number;
  currency: string;
  reference: string;
  creditorName: string;
  dueDate: string;
}

function parseQrContent(raw: string): ParsedQrInvoice {
  const lines = raw.split('\n').map(l => l.trim());
  if (lines[0] !== 'SPC') throw new Error('Not a valid Swiss QR bill (missing SPC header)');
  const iban = lines[3] ?? '';
  const amountStr = lines[18] ?? '0';
  const currency = lines[19] ?? 'CHF';
  const reference = lines[27] ?? '';
  const creditorName = lines[5] ?? '';
  const dueDateRaw = lines[29] ?? '';
  const dueDate = dueDateRaw
    ? convertDateFormatToString(dueDateRaw, DateFormat.IsoDate, DateFormat.StoreDate)
    : '';
  const amount = Math.round(parseFloat(amountStr) * 100);
  return { iban, amount, currency, reference, creditorName, dueDate };
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
