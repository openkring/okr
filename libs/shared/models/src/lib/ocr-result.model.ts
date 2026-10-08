import { DEFAULT_CURRENCY, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel, SearchableModel } from './base.model';

/** What an uploaded document is used for — drives extraction schema + post-processing. */
export type OcrUsage = 'invoice' | 'expense' | 'paper' | 'bill';

/** 'extracted' = fields written by stage ①; 'processed' = stage ② finished (booking made or n/a); 'failed' = extraction error. */
export type OcrResultStatus = 'extracted' | 'processed' | 'failed';

/** One VAT position read off the document. */
export interface OcrVatLine {
  rate: number;    // e.g. 8.1
  amount: number;  // cents
}

/**
 * Generic output of the OCR pipeline (one per uploaded file). Tenant-scoped.
 * Written by `onOcrFileFinalized`; consumed + updated by `onOcrResultWritten`.
 */
export class OcrResultModel implements OkrModel, SearchableModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public ocrUsage: OcrUsage = 'paper';
  public storagePath = '';          // tenant/{tenantId}/ocr/{ocrUsage}/[{correlationKey}/]{fileName}
  public correlationKey = '';       // optional caller ref (e.g. expenseKey); '' if none
  public documentKey = '';          // → DocumentModel (voucher) created by stage ①
  public status: OcrResultStatus = 'extracted';

  // extracted fields
  public vendor = '';
  public invoiceDate = '';          // yyyymmdd
  public grossAmount = 0;           // cents
  public currency = DEFAULT_CURRENCY;
  public vatLines: OcrVatLine[] = [];
  public subject = '';
  public confidence: Record<string, number> = {};
  // The Swiss QR-bill printed on the receipt (Swiss Payment Code, CRLF-separated), decoded by
  // stage ① — with the DEBTOR block blanked: the debtor is the member who paid, and this
  // collection is tenant-readable. '' = the receipt carries no QR-bill (or predates 2026-09-28).
  public qrBill = '';

  // Creditor read by Gemini from the printed invoice (spec 1.80 §5.1). Used only when qrBill is ''.
  // creditorIban is normalised and mod-97-valid, or ''.
  public creditorIban = '';
  public creditorName = '';
  public creditorAddress = '';
  public reference = '';

  // Read by Gemini for all finance usages (spec 1.91 Q2); '' when absent.
  public invoiceNumber = '';
  public dueDate = '';              // yyyymmdd

  // The QR-bill parsed by stage ② for usage 'bill' (spec 1.91 Q4); '' when qrBill is ''.
  public qrAmount = -1;             // Rappen; -1 = no QR-bill or amount left open
  public qrCurrency = '';
  public qrIban = '';
  public qrReference = '';          // normalized QRR/SCOR; '' for NON
  public qrCreditorName = '';
  public qrMessage = '';            // unstructured message

  // resolution (stage ②)
  public matchedRuleKey = '';       // '' if no rule matched
  public accountKey = '';           // resolved debit account (rule → llm → default)
  public llmProposedAccountKey = ''; // low-confidence hint when no rule matched
  public llmProposedAccountId = ''; // transient: the account NUMBER Gemini proposed; stage ② resolves it to llmProposedAccountKey
  public vatCodeKey = '';           // usage 'bill': rule VAT code, else the input code matching the single VAT rate
  public costCenterKey = '';        // usage 'bill': the matched rule's cost centre

  // post-processing
  public bookingKey = '';           // set by stage ②; '' guards idempotency
  public taskKey = '';              // → TaskModel; the treasurer review task stage ② opened ('' = none).
                                    // Lets reviewBooking close the task for every usage, not just 'expense'
                                    // (where task id == expense id == booking id).
  public error = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const OcrResultCollection = 'ocr-results';
export const OcrResultModelName = 'ocrResult';
