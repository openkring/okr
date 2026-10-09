import { PaymentReferenceType } from '@okr/shared-models';
import { parseSwissQrBill } from '@okr/shared-util-core';

import { normalizeIban, validateIban } from './iban.util';
import { detectPaymentType } from './pain001.util';

export interface ExpenseLike {
  okey: string; transferTo?: 'me' | 'issuer' | 'member'; amountTotal?: number; currency?: string;
  iban?: string; userName?: string; payeeName?: string; abstract?: string;
}

export interface ExpensePaymentSource {
  okey: string; qrBill?: string; grossAmount?: number; currency?: string; vendor?: string;
  creditorIban?: string; creditorName?: string; creditorAddress?: string; reference?: string;
}

export interface ExpensePaymentDraft {
  ocrResultKey: string; amount: number; currency: string; recipientName: string; recipientIban: string;
  recipientAddress: string; reference: string; referenceType: PaymentReferenceType; needsReview: boolean;
}

/** manual: ocrResultKeys that yielded no payment; 'me' when a reimbursement had no valid IBAN */
export interface ExpensePaymentPlan { drafts: ExpensePaymentDraft[]; manual: string[]; }

const toCents = (major: string): number => Math.round(parseFloat(major) * 100);

/** A positive, finite amount in cents — NaN (an unparseable QR amount) or Infinity never pays. */
const isPayable = (amount: number): boolean => Number.isFinite(amount) && amount > 0;

/** QRR / SCOR / NON for a reference; detectPaymentType's SEPA / ICP are transport types, not reference types. */
function referenceTypeOf(iban: string, currency: string, reference: string): PaymentReferenceType {
  const t = detectPaymentType(iban, currency, reference);
  return t === 'QRR' || t === 'SCOR' ? t : 'NON';
}

function fromQrBill(src: ExpensePaymentSource): ExpensePaymentDraft | undefined {
  const bill = parseSwissQrBill(src.qrBill);
  if (!bill || !validateIban(bill.iban) || !(bill.creditorName ?? '').trim()) return undefined;
  const amount = bill.amount ? toCents(bill.amount) : (src.grossAmount ?? 0);
  if (!isPayable(amount)) return undefined;
  const refType = bill.referenceType === 'QRR' || bill.referenceType === 'SCOR' ? bill.referenceType : 'NON';
  return {
    ocrResultKey: src.okey, amount, currency: bill.currency || src.currency || 'CHF',
    recipientName: bill.creditorName.trim(), recipientIban: normalizeIban(bill.iban),
    recipientAddress: [bill.creditorStreet, bill.creditorPlace, bill.creditorCountry].filter(Boolean).join('\n'),
    reference: refType === 'NON' ? bill.message : bill.reference, referenceType: refType, needsReview: false,
  };
}

function fromGemini(src: ExpensePaymentSource): ExpensePaymentDraft | undefined {
  const iban = src.creditorIban ?? '';
  const amount = src.grossAmount ?? 0;
  const recipientName = (src.creditorName || src.vendor || '').trim();
  if (!iban || !validateIban(iban) || !isPayable(amount) || !recipientName) return undefined;
  const currency = src.currency || 'CHF';
  const reference = src.reference ?? '';
  return {
    ocrResultKey: src.okey, amount, currency,
    recipientName, recipientIban: normalizeIban(iban),
    recipientAddress: src.creditorAddress ?? '', reference,
    referenceType: referenceTypeOf(iban, currency, reference), needsReview: true,
  };
}

/**
 * The draft payments a completed expense yields (spec 1.80 §4.1). Pure: the trigger loads the
 * expense and its ocr-results, this decides. A QR-bill always wins over Gemini-read creditor fields.
 */
export function buildExpensePayments(expense: ExpenseLike, sources: ExpensePaymentSource[]): ExpensePaymentPlan {
  // 'member' (entered by a treasurer for a member) pays like 'me', to the stamped payee
  if ((expense.transferTo ?? 'me') !== 'issuer') {
    const iban = expense.iban ?? '';
    const amount = expense.amountTotal ?? 0;
    const recipientName = ((expense.transferTo === 'member' ? expense.payeeName : expense.userName) ?? '').trim();
    // No payee name, no payment: pain.001 needs a creditor <Nm>, so the treasurer pays by hand.
    if (!iban || !validateIban(iban) || !isPayable(amount) || !recipientName) return { drafts: [], manual: ['me'] };
    return {
      drafts: [{
        ocrResultKey: '', amount, currency: expense.currency || 'CHF', recipientName,
        recipientIban: normalizeIban(iban), recipientAddress: '',
        reference: `Spesen: ${expense.abstract ?? ''}`.trim(), referenceType: 'NON', needsReview: false,
      }],
      manual: [],
    };
  }
  const drafts: ExpensePaymentDraft[] = [];
  const manual: string[] = [];
  for (const src of sources) {
    const draft = (src.qrBill ? fromQrBill(src) : undefined) ?? fromGemini(src);
    if (draft) drafts.push(draft);
    else manual.push(src.okey);
  }
  return { drafts, manual };
}
