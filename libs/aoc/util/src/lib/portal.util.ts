import { isValidTenantId, PORTAL_TENANT_KEY } from '@okr/shared-config';
import { TenantConfigMeta } from './tenant-switcher.util';

/**
 * The iOS portal's app chooser (spec 1.179 §6.2).
 *
 * The device remembers the tenants the person opened (`okr.portal.tenants`, newest first); the
 * chooser adds the tenants the person can log in to (`listMyLoginTenants`) and the tenants that
 * agreed to be listed (`AppConfig.listedInPortal`). Pure functions; storage is passed in.
 */
export const PORTAL_TENANTS_KEY = 'okr.portal.tenants';
const MAX_SAVED = 50;

export type SavedTenant = { tenantId: string; lastUsed: number };
export type ChooserSource = 'saved' | 'login' | 'listed';
export type ChooserEntry = { tenantId: string; name: string; logoUrl?: string; source: ChooserSource };

/** The remembered tenants; broken JSON, invalid ids and blocked storage give an empty list. */
export function readSavedTenants(storage: Pick<Storage, 'getItem'> | undefined): SavedTenant[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(PORTAL_TENANTS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is SavedTenant =>
      typeof row === 'object' && row !== null
      && isValidTenantId((row as SavedTenant).tenantId)
      && typeof (row as SavedTenant).lastUsed === 'number');
  } catch {
    return [];
  }
}

function writeSavedTenants(storage: Pick<Storage, 'setItem'>, list: SavedTenant[]): void {
  try {
    storage.setItem(PORTAL_TENANTS_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {
    // blocked or full storage: the chooser falls back to the login and listed tenants
  }
}

/** Puts the tenant at the front with `now` as its last use. */
export function touchSavedTenant(storage: Pick<Storage, 'getItem' | 'setItem'>, tenantId: string, now: number): void {
  if (!isValidTenantId(tenantId)) return;
  const rest = readSavedTenants(storage).filter((t) => t.tenantId !== tenantId);
  writeSavedTenants(storage, [{ tenantId, lastUsed: now }, ...rest]);
}

/**
 * Makes `tenantId` the tenant of the next start (the caller then reloads) and remembers it.
 * False for an invalid id or blocked storage; nothing is written then.
 */
export function chooseTenant(storage: Pick<Storage, 'getItem' | 'setItem'>, tenantId: string, now: number): boolean {
  if (!isValidTenantId(tenantId)) return false;
  try {
    storage.setItem(PORTAL_TENANT_KEY, tenantId);
  } catch {
    return false;
  }
  touchSavedTenant(storage, tenantId, now);
  return true;
}

export function removeSavedTenant(storage: Pick<Storage, 'getItem' | 'setItem'>, tenantId: string): void {
  writeSavedTenants(storage, readSavedTenants(storage).filter((t) => t.tenantId !== tenantId));
}

/**
 * One entry per tenant. Source precedence saved > login > listed; order: saved by last use (newest
 * first), then login tenants, then listed tenants by name. A tenant without a config no longer exists
 * and is dropped.
 */
export function buildChooserEntries(
  saved: SavedTenant[],
  loginTenants: string[],
  listed: string[],
  configs: Map<string, TenantConfigMeta>,
): ChooserEntry[] {
  const seen = new Set<string>();
  const entry = (tenantId: string, source: ChooserSource): ChooserEntry | undefined => {
    const config = configs.get(tenantId);
    if (!config || seen.has(tenantId) || !isValidTenantId(tenantId)) return undefined;
    seen.add(tenantId);
    const result: ChooserEntry = { tenantId, name: config.appName || tenantId, source };
    if (config.logoUrl) result.logoUrl = config.logoUrl;
    return result;
  };
  const savedEntries = [...saved].sort((a, b) => b.lastUsed - a.lastUsed).map((t) => entry(t.tenantId, 'saved'));
  const loginEntries = loginTenants.map((id) => entry(id, 'login'));
  const listedEntries = listed
    .map((id) => entry(id, 'listed'))
    .filter((e): e is ChooserEntry => !!e)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...savedEntries, ...loginEntries].filter((e): e is ChooserEntry => !!e).concat(listedEntries);
}
