import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import { CostCenterLike, isActiveLeafCostCenter, isProfitAndLossAccountId, resolveCostCenterKey } from '@okr/shared-util-core';

const ACCOUNT_COLLECTION = 'accounts';
const COST_CENTER_COLLECTION = 'cost-centers';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';

export interface AccountLite { okey: string; id?: string; costCenterKey?: string; accountingTenantId?: string; parentKey?: string }
export interface CostCenterContext {
  accountingTenantId: string; accounts: Map<string, AccountLite>; costCenters: CostCenterLike[];
  /** `AccountingConfig.defaultCostCenterKey` — last fallback for P&L lines; '' = keine Kostenstelle */
  bookDefaultKey: string;
}

/** Unique, non-blank account keys: `doc('')` throws in the Admin SDK, so callers may pass unresolved keys. */
export function accountKeysToLoad(keys: string[]): string[] {
  return [...new Set(keys.map(k => (k ?? '').trim()).filter(k => k !== ''))];
}

/**
 * Accounts (the given keys, or all of the accounting tenant), the tenant's Kostenstellen and the
 * book default from `accounting-configs/{accountingTenantId}` — everything `resolveCostCenterKey`
 * needs. Reads only; call it before a transaction's first write.
 */
export async function loadCostCenterContext(db: Firestore, tenantId: string, accountingTenantId: string, accountKeys?: string[]): Promise<CostCenterContext> {
  const accounts = new Map<string, AccountLite>();
  const keys = accountKeys ? accountKeysToLoad(accountKeys) : undefined;
  const accountDocs = keys
    ? (keys.length ? await db.getAll(...keys.map(k => db.collection(ACCOUNT_COLLECTION).doc(k))) : [])
    : (await db.collection(ACCOUNT_COLLECTION).where('accountingTenantId', '==', accountingTenantId).get()).docs;
  for (const snap of accountDocs) {
    const data = snap.data() as Record<string, unknown> | undefined;
    if (!data || !((data['tenants'] as string[] | undefined) ?? []).includes(tenantId)) continue;
    // an account of another accounting tenant (e.g. gss on an scs booking) is treated as unknown
    if (!belongsToAccountingTenant(data, accountingTenantId)) continue;
    accounts.set(snap.id, { okey: snap.id, ...(data as Omit<AccountLite, 'okey'>) });
  }
  const centerSnap = await db.collection(COST_CENTER_COLLECTION).where('accountingTenantId', '==', accountingTenantId).get();
  const costCenters = centerSnap.docs
    .filter(s => ((s.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId))
    .map(s => ({ okey: s.id, ...(s.data() as Omit<CostCenterLike, 'okey'>) }));
  const configSnap = await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get();
  const configData = configSnap.data() as { defaultCostCenterKey?: unknown } | undefined;
  // legacy configs lack the field
  const bookDefaultKey = typeof configData?.defaultCostCenterKey === 'string' ? configData.defaultCostCenterKey : '';
  return { accountingTenantId, accounts, costCenters, bookDefaultKey };
}

/** True when the account document belongs to the given accounting tenant. */
export function belongsToAccountingTenant(account: { accountingTenantId?: unknown }, accountingTenantId: string): boolean {
  return account.accountingTenantId === accountingTenantId;
}

export function costCenterKeyForLine(ctx: CostCenterContext, accountKey: string, input: { explicit?: string; source?: string; rule?: string } = {}): string {
  return resolveCostCenterKey({ ...input, account: ctx.accounts.get(accountKey), costCenters: ctx.costCenters, bookDefault: ctx.bookDefaultKey });
}

/** Throws `cost-center-invalid` for an explicit key that is neither valid nor grandfathered (P&L accounts only). */
export function assertExplicitCostCenter(ctx: CostCenterContext, accountKey: string, explicit: string | undefined, grandfathered: Set<string>): void {
  const key = (explicit ?? '').trim();
  if (!key) return;
  const account = ctx.accounts.get(accountKey);
  const ok = !!account && isProfitAndLossAccountId(account.id)
    && (grandfathered.has(key) || isActiveLeafCostCenter(key, ctx.accountingTenantId, ctx.costCenters));
  if (!ok) throw new HttpsError('invalid-argument', `cost-center-invalid: ${key}`, { reason: 'cost-center-invalid', costCenterKey: key });
}
