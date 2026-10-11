import { DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';
import { MoneyModel } from './money.model';

export type CostAllocationSide = 'expense' | 'revenue';
export type CostAllocationMode = 'amount' | 'percent';
/** D26: Kostenstelle → Kostenstelle, Kostenstelle → Projekt, Projekt → Projekt */
export type CostAllocationScope = 'center' | 'centerToProject' | 'project';

/**
 * An Umlage (spec 1.65 D24): a report-level rule that moves a fixed amount or a share of a source
 * Kostenstelle's Aufwand or Ertrag to a target Kostenstelle in the Soll-Ist views of one fiscal year of one
 * set of books. It never touches the ledger. Archived, never deleted.
 */
export class CostAllocationModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public notes = DEFAULT_NOTES;
  public accountingTenantId = '';
  public scope: CostAllocationScope = 'center'; // legacy docs lack it ⇒ 'center'
  public fiscalYear = 0;                       // the year the fiscal year starts in; 0 for scope 'project' (whole life)
  public title = '';                           // shown as the one-line row, e.g. 'Umlage Clubhaus'
  public side: CostAllocationSide = 'expense';
  public fromCostCenterKey = '';
  public toCostCenterKey = '';
  public fromProjectKey = '';                  // scope 'project'
  public toProjectKey = '';                    // scopes 'centerToProject' and 'project'
  public mode: CostAllocationMode = 'percent';
  public amount = new MoneyModel(0, 'CHF');    // mode 'amount', minor units
  public percent = 0;                          // mode 'percent', 0 < percent ≤ 100

  constructor(tenantId: string, accountingTenantId: string, fiscalYear: number) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
    this.fiscalYear = fiscalYear;
  }
}

export const CostAllocationCollection = 'cost-allocations';
export const CostAllocationModelName = 'costAllocation';
