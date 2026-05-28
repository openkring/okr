import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel } from './base.model';

export type OcrStatus = 'pending' | 'completed' | 'failed' | 'manual';

export class ExpenseDocumentModel implements BkModel {
  public bkey = DEFAULT_KEY;
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
