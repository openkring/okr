import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';
import { MoneyModel } from './money.model';

export type BudgetKind = 'budget' | 'forecast';
export type BudgetStatus = 'draft' | 'approved' | 'superseded';
export type BudgetApprovalBody = 'gv' | 'board';

/**
 * One version of a fiscal year's budget (spec 1.65 D11). A new version copies all lines of its base;
 * `approved` and `superseded` versions are frozen (Firestore rules). Archived, never deleted.
 */
export class BudgetVersionModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public notes = DEFAULT_NOTES;
  public accountingTenantId = '';
  public fiscalYear = 0;                       // the year the fiscal year starts in (label derived, e.g. '2027/28')
  public name = DEFAULT_NAME;                  // 'Budget GV 2027'
  public kind: BudgetKind = 'budget';
  public status: BudgetStatus = 'draft';
  public basedOnVersionKey = '';               // '' for the first version of a year
  public approvedAt = '';                      // StoreDate yyyymmdd; '' until approved
  public approvedBy: BudgetApprovalBody | '' = '';
  public approvalRef = '';                     // free text, e.g. 'GV-Protokoll 2026-11-20'

  constructor(tenantId: string, accountingTenantId: string, fiscalYear: number) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
    this.fiscalYear = fiscalYear;
  }
}

/**
 * One budget cell: version × leaf Kostenstelle × P&L leaf account (spec 1.65 D4), sparse.
 * `amount` is positive in the account's natural direction (expense on 4–6, revenue on 3/7–9).
 */
export class BudgetLineModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public notes = DEFAULT_NOTES;
  public accountingTenantId = '';
  public versionKey = '';
  public costCenterKey = '';
  public accountKey = '';
  public amount = new MoneyModel(0, 'CHF');

  constructor(tenantId: string, accountingTenantId: string, versionKey: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
    this.versionKey = versionKey;
  }
}

export const BudgetVersionCollection = 'budget-versions';
export const BudgetVersionModelName = 'budgetVersion';
export const BudgetLineCollection = 'budget-lines';
export const BudgetLineModelName = 'budgetLine';
