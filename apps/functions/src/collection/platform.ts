import type { Firestore } from 'firebase-admin/firestore';
import { PlatformConfigBillingDocId, PlatformConfigBillingPrivateDocId, PlatformConfigCollection } from '@okr/shared-models';
import type { PlatformBillingConfig } from '@okr/shared-models';

const DEFAULT_PLATFORM_BILLING: PlatformBillingConfig = { operatorTenantId: 'bkg', accountingTenantId: 'bkg', excludedUids: [] };

const uidsOf = (data: Record<string, unknown> | undefined): string[] =>
  Array.isArray(data?.['excludedUids']) ? (data['excludedUids'] as unknown[]).filter((u): u is string => typeof u === 'string') : [];

/**
 * Which tenant (and which books) bill the other tenants, from platform-config/billing (falls back to bkg/bkg while
 * absent), and the excluded uids from the operator-only platform-config/billing-private. A legacy `excludedUids` left on
 * the public doc is still honoured (union) until it is moved.
 */
export async function platformBilling(db: Firestore): Promise<PlatformBillingConfig> {
  const col = db.collection(PlatformConfigCollection);
  const [pub, priv] = await Promise.all([col.doc(PlatformConfigBillingDocId).get(), col.doc(PlatformConfigBillingPrivateDocId).get()]);
  const data = (pub.exists ? pub.data() : undefined) as Record<string, unknown> | undefined;
  const privateData = (priv.exists ? priv.data() : undefined) as Record<string, unknown> | undefined;
  return {
    operatorTenantId: String(data?.['operatorTenantId'] || DEFAULT_PLATFORM_BILLING.operatorTenantId),
    accountingTenantId: String(data?.['accountingTenantId'] || DEFAULT_PLATFORM_BILLING.accountingTenantId),
    excludedUids: [...new Set([...uidsOf(privateData), ...uidsOf(data)])],
  };
}
