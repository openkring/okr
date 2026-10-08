import { AccountModel, BudgetApprovalBody, BudgetKind, BudgetLineModel, BudgetVersionModel, MoneyModel } from '@okr/shared-models';
import { isProfitAndLossAccountId } from '@okr/shared-util-core';

/** Only a live draft takes line edits, a rename or an archive (approved/superseded are frozen, D11). */
export function isVersionEditable(v: Pick<BudgetVersionModel, 'status' | 'isArchived'>): boolean {
  return (v.status ?? 'draft') === 'draft' && v.isArchived !== true;
}

/** The board's reference (D12): newest approved version of that kind and fiscal year. */
export function newestApprovedBudget(versions: BudgetVersionModel[], fiscalYear: number, kind: BudgetKind = 'budget'): BudgetVersionModel | undefined {
  return versions
    .filter(v => !v.isArchived && v.status === 'approved' && v.fiscalYear === fiscalYear && (v.kind ?? 'budget') === kind)
    .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? ''))[0];
}

export interface ApprovalPatch {
  approve: Partial<BudgetVersionModel> & { okey: string };
  /** okeys of the versions that become `superseded` in the same batch */
  supersede: string[];
}

/** What one approval writes: the target becomes approved, every other approved version of the same year and kind superseded. */
export function planApproval(
  versions: BudgetVersionModel[], target: BudgetVersionModel,
  approval: { approvedAt: string; approvedBy: BudgetApprovalBody; approvalRef: string },
): ApprovalPatch {
  if (!isVersionEditable(target)) throw new Error('budget-not-draft');
  const kind = target.kind ?? 'budget';
  return {
    approve: { okey: target.okey, status: 'approved', ...approval },
    supersede: versions
      .filter(v => v.okey !== target.okey && v.status === 'approved' && v.fiscalYear === target.fiscalYear && (v.kind ?? 'budget') === kind)
      .map(v => v.okey),
  };
}

/** The cells of `fromVersionKey`, re-parented to `toVersionKey` with empty okeys (new documents). */
export function copyBudgetLines(lines: BudgetLineModel[], fromVersionKey: string, toVersionKey: string): BudgetLineModel[] {
  return lines
    .filter(l => l.versionKey === fromVersionKey && !l.isArchived)
    .map(l => ({ ...l, okey: '', versionKey: toVersionKey, amount: new MoneyModel(l.amount?.amount ?? 0, l.amount?.currency, l.amount?.periodicity) }));
}

export function budgetCellKey(costCenterKey: string, accountKey: string): string {
  return `${costCenterKey}|${accountKey}`;
}

/** A budget cell may sit only on an active P&L leaf account (same leaf rule as `leafAccounts()`). */
export function isBudgetableAccount(account: AccountModel, accounts: AccountModel[]): boolean {
  if (account.isArchived || !isProfitAndLossAccountId(account.id)) return false;
  return !accounts.some(a => a.parentKey === account.okey && !a.isArchived);
}

/**
 * Splits writes into Firestore batches (limit 500). The first chunk keeps `firstReserved` slots for
 * documents written alongside (the version doc), so 900 items → 399 / 400 / 101. No items still
 * yields one empty chunk, because the version itself must be written.
 */
export function chunkWrites<T>(items: T[], size = 400, firstReserved = 1): T[][] {
  const chunks: T[][] = [];
  let i = 0;
  let take = Math.max(1, size - firstReserved);
  do {
    chunks.push(items.slice(i, i + take));
    i += take;
    take = size;
  } while (i < items.length);
  return chunks;
}
