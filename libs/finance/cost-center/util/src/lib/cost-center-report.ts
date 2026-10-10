/**
 * The response of the `getMyCostCenterReport` callable (spec 1.65 §7.1, D21) — shared by the Cloud
 * Function and the client. Raw, already scoped data: the client aggregates it with the treasurer's own
 * utils so both see the same numbers. Amounts in minor units; a masked booking carries no title and no
 * counterparty (D22).
 */
export interface ReportCostCenter { okey: string; id: string; name: string; parentKey: string; type: string }
export interface ReportAccount { okey: string; id: string; name: string; parentKey: string; type: string; isArchived: boolean }
export interface ReportBudgetLine { costCenterKey: string; accountKey: string; amount: number }
export interface ReportBooking { okey: string; date: string; bookingNo: number; title: string; counterpartyName: string; masked: boolean }
export interface ReportLine { bookingKey: string; accountKey: string; costCenterKey: string; debit: number; credit: number }

export interface MyCostCenterReport {
  accountingTenantId: string;
  fiscalYear: number;
  /** years with an approved budget, plus the current one, newest first */
  fiscalYears: number[];
  /** treasurer, admin or auditor: every Kostenstelle, unmasked */
  fullAccess: boolean;
  costCenters: ReportCostCenter[];
  accounts: ReportAccount[];
  /** the reference version (newest approved budget of the year, D12); null when none is approved */
  budget: { versionKey: string; name: string } | null;
  budgetLines: ReportBudgetLine[];
  bookings: ReportBooking[];
  lines: ReportLine[];
}
