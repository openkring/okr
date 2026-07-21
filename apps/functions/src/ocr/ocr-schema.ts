import { Type } from '@google/genai';
import type { OcrUsage } from './ocr-path.util';

/** Structured-output schema for Gemini. invoiceDate is requested as yyyymmdd digits to avoid date parsing. */
export const OCR_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    vendor:      { type: Type.STRING, description: 'Supplier / invoice sender name' },
    invoiceDate: { type: Type.STRING, description: 'Document date as 8 digits yyyymmdd, e.g. 20260721; empty if unreadable' },
    grossAmount: { type: Type.NUMBER, description: 'Total gross amount incl. VAT, in major units (e.g. 49.90)' },
    currency:    { type: Type.STRING, description: 'ISO 4217, e.g. CHF' },
    vatLines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rate:   { type: Type.NUMBER, description: 'VAT rate percent, e.g. 8.1' },
          amount: { type: Type.NUMBER, description: 'VAT amount in major units' },
        },
        required: ['rate', 'amount'],
      },
    },
    subject:              { type: Type.STRING, description: 'Short description / invoice number' },
    llmProposedAccountId: { type: Type.STRING, description: 'Best-fit account NUMBER from the provided chart, or empty' },
    confidence: {
      type: Type.OBJECT,
      properties: {
        overall: { type: Type.NUMBER, description: '0..1' },
        vendor:  { type: Type.NUMBER },
        amount:  { type: Type.NUMBER },
        date:    { type: Type.NUMBER },
      },
    },
  },
  required: ['vendor', 'invoiceDate', 'grossAmount', 'currency'],
};

/** The raw JSON shape Gemini returns (matches OCR_RESPONSE_SCHEMA). */
export interface OcrRawExtraction {
  vendor: string;
  invoiceDate: string;
  grossAmount: number;
  currency: string;
  vatLines?: { rate: number; amount: number }[];
  subject?: string;
  llmProposedAccountId?: string;
  confidence?: Record<string, number>;
}

/**
 * Per-usage prompt. `accountList` is a compact "id name" list of the tenant's leaf accounts,
 * used only so the model can propose an account when no deterministic rule will match.
 */
export function buildOcrPrompt(usage: OcrUsage, accountList: string): string {
  const base =
    'Extract the structured fields from this document. Use empty string / empty array where a value ' +
    'is not present. Amounts are numbers in major currency units. invoiceDate must be 8 digits yyyymmdd.';
  if (usage === 'paper') {
    return `${base} This is a generic document; set grossAmount to 0 if there is no total.`;
  }
  const kind = usage === 'invoice' ? 'supplier invoice' : 'expense receipt';
  return (
    `${base} This is a ${kind}. For llmProposedAccountId, choose the single best-fit account number ` +
    `from this chart of accounts (return only the number, or empty if unsure):\n${accountList}`
  );
}
