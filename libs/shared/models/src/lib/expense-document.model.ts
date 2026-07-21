import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';

export type OcrStatus = 'pending' | 'completed' | 'failed' | 'manual';

/**
 * @deprecated Superseded by OcrResultModel (`ocr-results`). The OCR pipeline writes extraction
 * results to `ocr-results`; this collection is no longer written by the expense feature.
 */
export class ExpenseDocumentModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public expenseKey = DEFAULT_KEY;
  public documentKey = DEFAULT_KEY;

  public ocrInvoiceDate = '';
  public ocrAmount = 0;
  public ocrSubject = '';
  public ocrVatAmount = 0;
  public ocrVatRate = 0;
  public ocrCurrency = '';
  public ocrConfidence = 0;
  public ocrStatus: OcrStatus = 'pending';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseDocumentCollection = 'expense-documents';
export const ExpenseDocumentModelName = 'expenseDocument';
