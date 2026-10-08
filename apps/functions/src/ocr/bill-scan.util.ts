import { normalizeQrReference } from '@okr/shared-util-core';
import { parseQrContent } from '../payment/parse-qr-invoice';

export interface QrFields {
  qrAmount: number; qrCurrency: string; qrIban: string; qrReference: string; qrCreditorName: string; qrMessage: string;
}
export interface VatCodeLite {
  okey: string; code?: string; rate: number; direction: string; validFrom: string; validTo: string; isArchived?: boolean;
}

const NO_QR: QrFields = { qrAmount: -1, qrCurrency: '', qrIban: '', qrReference: '', qrCreditorName: '', qrMessage: '' };

/** The parsed QR-bill for the ocr-results doc (spec 1.91 Q4); the empty set when there is none or it is unreadable. */
export function qrFieldsOf(qrBill: string): QrFields {
  if (!qrBill) return { ...NO_QR };
  try {
    const p = parseQrContent(qrBill);
    return {
      qrAmount: p.amount > 0 ? p.amount : -1, qrCurrency: p.currency, qrIban: p.iban.replace(/\s+/g, '').toUpperCase(),
      qrReference: normalizeQrReference(p.reference), qrCreditorName: p.creditorName, qrMessage: p.message,
    };
  } catch {
    return { ...NO_QR };
  }
}

/**
 * The okey of the rule's VAT code if it exists, else of the one input code valid on `date` whose rate equals the
 * single VAT rate. The ocr-rule form stores `VatCodeModel.code` (e.g. `VST_MAT`), so the rule matches by code; an
 * okey match is accepted too. Archived codes never match.
 */
export function pickVatCodeKey(ruleVatCode: string, vatLines: { rate: number }[], allCodes: VatCodeLite[], date: string): string {
  const codes = (allCodes ?? []).filter((c) => !c.isArchived);
  const ruleHit = ruleVatCode ? codes.find((c) => c.code === ruleVatCode || c.okey === ruleVatCode) : undefined;
  if (ruleHit) return ruleHit.okey;
  const rates = [...new Set((vatLines ?? []).map((v) => v.rate).filter((r) => r > 0))];
  if (rates.length !== 1) return '';
  const valid = codes.filter((c) => c.direction === 'input' && c.rate === rates[0]
    && (!c.validFrom || c.validFrom <= date) && (!c.validTo || date <= c.validTo));
  return valid.length === 1 ? valid[0].okey : '';
}
