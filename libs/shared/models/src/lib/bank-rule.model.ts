import { DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel } from './base.model';

export type BankRuleCondition = 'contains' | 'startsWith' | 'endsWith' | 'regex';

/**
 * A treasurer-authored mapping from a bank statement text to a booking title + counter-account
 * (spec 1.60 §3.2 / §5). Shared by every bank profile of the accounting tenant.
 * `term` is stored PRE-NORMALIZED (normalizeText) for the three string conditions — the matcher
 * normalizes only the statement side. A `regex` term is stored as typed and applied to the
 * normalized text case-insensitively. The rule never decides debit/credit: the sign of the row does.
 */
export class BankRuleModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public notes = DEFAULT_NOTES;

  public condition: BankRuleCondition = 'contains';
  public term = '';
  public title = '';                      // booking description; regex rules may use $1..$9
  public accountKey = '';                 // ref AccountModel: the COUNTER-account
  public vatCodeKey = '';                 // ref VatCodeModel, optional
  public priority = 0;                    // higher wins
  public active = true;
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const BankRuleCollection = 'bank-rules';
export const BankRuleModelName = 'bankRule';
