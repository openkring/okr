import type { Firestore } from 'firebase-admin/firestore';
import { PlatformConfigBillingDocId, PlatformConfigCollection } from '@okr/shared-models';
import type { PlatformBillingConfig } from '@okr/shared-models';

const DEFAULT_PLATFORM_BILLING: PlatformBillingConfig = { operatorTenantId: 'bkg', accountingTenantId: 'bkg' };

/** Which tenant (and which books) bills the other tenants. Falls back to bkg/bkg while the doc is absent. */
export async function platformBilling(db: Firestore): Promise<PlatformBillingConfig> {
  const snap = await db.collection(PlatformConfigCollection).doc(PlatformConfigBillingDocId).get();
  if (!snap.exists) return { ...DEFAULT_PLATFORM_BILLING };
  const data = (snap.data() ?? {}) as Partial<PlatformBillingConfig>;
  return {
    operatorTenantId: data.operatorTenantId || DEFAULT_PLATFORM_BILLING.operatorTenantId,
    accountingTenantId: data.accountingTenantId || DEFAULT_PLATFORM_BILLING.accountingTenantId,
  };
}
