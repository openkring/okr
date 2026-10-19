import { AccountingConfigModel } from '@okr/shared-models';

/** The model types that may own a set of books (spec 1.105 amendment). */
export type AccountingOwnerType = 'org' | 'person';

export interface AccountingOwnerRef {
  modelType: AccountingOwnerType;
  key: string;
}

const OWNER_TYPES: readonly AccountingOwnerType[] = ['org', 'person'];

/**
 * Splits a books owner `'org.<okey>'` / `'person.<okey>'` into its model type and okey.
 * Undefined for '' (no owner), an unknown prefix, a bare okey without prefix, or an empty key.
 */
export function parseOwnerKey(ownerKey: string | undefined): AccountingOwnerRef | undefined {
  if (!ownerKey) return undefined;
  const dot = ownerKey.indexOf('.');
  if (dot < 0) return undefined;
  const modelType = ownerKey.slice(0, dot) as AccountingOwnerType;
  const key = ownerKey.slice(dot + 1);
  if (!OWNER_TYPES.includes(modelType) || !key) return undefined;
  return { modelType, key };
}

/** The ownerKey of books owned by the org `orgKey`. */
export function orgOwnerKey(orgKey: string): string {
  return 'org.' + orgKey;
}

/** The ownerKey of books owned by the person `personKey`. */
export function personOwnerKey(personKey: string): string {
  return 'person.' + personKey;
}

/**
 * The books owner of a config as stored: `ownerKey`, else the legacy `orgId` as an org owner,
 * else '' (no owner — never the tenant id or app-config ownerOrgId: accountingTenantId ≠ tenantId).
 * Every reader of the owner goes through here.
 */
export function resolveOwnerKey(config: (Partial<Pick<AccountingConfigModel, 'ownerKey'>> & { orgId?: string }) | undefined): string {
  if (config?.ownerKey) return config.ownerKey;
  // legacy orgId — remove after the 1.105 data migration
  return config?.orgId ? orgOwnerKey(config.orgId) : '';
}
