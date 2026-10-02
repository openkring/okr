import { normalizeIban, validateIban } from '@okr/finance-payment-util';

import type { OcrRawExtraction } from './ocr-schema';

/**
 * The creditor fields as stage ① stores them (spec 1.80 §5.1). An IBAN failing mod-97 is
 * stored as '' — a hallucinated IBAN must never reach a payment.
 */
export function sanitizeCreditor(raw: OcrRawExtraction): {
  creditorIban: string; creditorName: string; creditorAddress: string; reference: string;
} {
  const iban = normalizeIban(raw.creditorIban ?? '');
  return {
    creditorIban: iban && validateIban(iban) ? iban : '',
    creditorName: (raw.creditorName ?? '').trim(),
    creditorAddress: (raw.creditorAddress ?? '').trim(),
    reference: (raw.reference ?? '').trim(),
  };
}
