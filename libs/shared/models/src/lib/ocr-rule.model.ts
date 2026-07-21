import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';
import { OcrUsage } from './ocr-result.model';

/**
 * Admin-editable mapping: (ocrUsage, party) → debit account (+ optional cost center / VAT code).
 * A matching rule takes priority over the LLM's account proposal (accuracy + cost).
 * Tenant-scoped. Matching normalizes the extracted vendor and tests normalized-contains
 * against `party` and each alias; the highest-`rank` active rule for the usage wins.
 */
export class OcrRuleModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public ocrUsage: OcrUsage = 'expense';
  public party = '';            // normalized match token, e.g. 'migros'
  public aliases: string[] = []; // extra normalized tokens
  public accountKey = '';       // debit account to set
  public costCenterId = '';     // optional
  public vatCode = '';          // optional
  public rank = 0;              // higher wins on multiple matches
  public active = true;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const OcrRuleCollection = 'ocr-rules';
export const OcrRuleModelName = 'ocrRule';
