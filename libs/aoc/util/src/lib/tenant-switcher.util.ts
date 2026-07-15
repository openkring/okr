/** Project-wide Firebase Hosting site suffix — identical across every site in `bkaiser-org`. */
export const FIREBASE_HOSTING_SUFFIX = '54aef';

/** Slice of `AppConfig` the switcher needs, per tenant. */
export interface TenantConfigMeta {
  appName?: string;
  logoUrl?: string;
  appDomain?: string;
}

/** A single tile in the app-switcher grid. */
export interface TenantSwitcherEntry {
  tenantId: string;
  label: string;
  logoUrl: string; // raw app-config path; resolved to a full imgix URL in the grid component
  url: string;
  isCurrent: boolean;
}

/**
 * The target app URL for a tenant. Prefers a configured custom domain, otherwise derives the
 * Firebase Hosting URL by convention: `https://{tenantId}-app-{SUFFIX}.web.app`.
 */
export function resolveTenantAppUrl(tenantId: string, appDomain?: string): string {
  const domain = (appDomain ?? '').trim();
  if (domain) {
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }
  return `https://${tenantId}-app-${FIREBASE_HOSTING_SUFFIX}.web.app`;
}

/**
 * Build the ordered switcher entries from the person's tenant memberships and the per-tenant
 * config map. Dedupes, drops empty ids, marks the current tenant, and sorts current-first then
 * alphabetically by label. Missing config falls back to the tenantId as label.
 */
export function buildSwitcherEntries(
  tenants: string[],
  currentTenantId: string,
  configs: Map<string, TenantConfigMeta>,
): TenantSwitcherEntry[] {
  const unique = Array.from(new Set(tenants.filter((t) => !!t)));
  const entries: TenantSwitcherEntry[] = unique.map((tenantId) => {
    const cfg = configs.get(tenantId);
    return {
      tenantId,
      label: cfg?.appName?.trim() || tenantId,
      logoUrl: cfg?.logoUrl ?? '',
      url: resolveTenantAppUrl(tenantId, cfg?.appDomain),
      isCurrent: tenantId === currentTenantId,
    };
  });
  return entries.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
