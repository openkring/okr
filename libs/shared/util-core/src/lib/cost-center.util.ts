/** Minimal shape of a Kostenstelle — structural, so Cloud Functions can pass raw Firestore docs. */
export interface CostCenterLike {
  okey: string; parentKey?: string; accountingTenantId?: string; isArchived?: boolean;
  /** 'root' | 'group' | 'leaf'; absent on a minimal shape, which then counts by its children alone */
  type?: string;
}
/** Minimal shape of the account a line is booked on. */
export interface CostCenterAccountLike { id?: string; costCenterKey?: string; accountingTenantId?: string }

/** Erfolgsrechnung accounts: classes 3–9 of the Swiss KMU chart; 1/2 are balance-sheet accounts. */
export function isProfitAndLossAccountId(id: string | undefined): boolean {
  return /^[3-9]/.test((id ?? '').trim());
}

/**
 * A Kostenstelle a line may point at: known, not archived, same accounting tenant, no children,
 * and — when the type is known — of type 'leaf' (a childless group or root is still not postable).
 */
export function isActiveLeafCostCenter(key: string | undefined, accountingTenantId: string, costCenters: CostCenterLike[]): boolean {
  if (!key) return false;
  const center = costCenters.find(c => c.okey === key);
  if (!center || center.isArchived === true || (center.accountingTenantId ?? '') !== accountingTenantId) return false;
  if (center.type !== undefined && center.type !== 'leaf') return false;
  return !costCenters.some(c => c.parentKey === key);
}

/**
 * The Kostenstelle of one booking line (spec 1.65 §6.1). Priority explicit > source > rule >
 * account default > book default (`AccountingConfig.defaultCostCenterKey`); a candidate that is not
 * an active leaf of the account's accounting tenant is skipped. Balance-sheet lines never carry one.
 */
export function resolveCostCenterKey(input: {
  explicit?: string; source?: string; rule?: string;
  account: CostCenterAccountLike | undefined; costCenters: CostCenterLike[];
  /** accounting-wide default Kostenstelle — the last fallback for P&L lines; '' = none */
  bookDefault?: string;
}): string {
  const account = input.account;
  if (!account || !isProfitAndLossAccountId(account.id)) return '';
  const tenant = account.accountingTenantId ?? '';
  for (const candidate of [input.explicit, input.source, input.rule, account.costCenterKey, input.bookDefault]) {
    if (isActiveLeafCostCenter(candidate, tenant, input.costCenters)) return candidate as string;
  }
  return '';
}
