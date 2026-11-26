import { isValidTenantId, TenantMode } from '@okr/shared-config';
import { resolveTenantAppUrl, TenantConfigMeta } from './tenant-switcher.util';

/**
 * What a tenant link `https://app.kring.ch/t/<tenantId>` does (spec 1.179 §6.2):
 * - in the iOS portal (runtime): switch to that tenant;
 * - in the kring web app or any tenant app (fixed): send the person to the tenant's own app;
 * - an invalid id, or a tenant without `app-config`: open the chooser with a note.
 */
export type TenantLinkAction =
  | { kind: 'switch'; tenantId: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'home' }
  | { kind: 'chooser'; note: 'unknown' };

export function resolveTenantLink(
  tenantId: string, mode: TenantMode, config: TenantConfigMeta | undefined, bootTenantId?: string,
): TenantLinkAction {
  if (!isValidTenantId(tenantId) || !config) return { kind: 'chooser', note: 'unknown' };
  // the tenant already running: no reload (a reload would meet the same link again)
  if (mode === 'runtime' && tenantId === bootTenantId) return { kind: 'home' };
  if (mode === 'runtime') return { kind: 'switch', tenantId };
  return { kind: 'redirect', url: resolveTenantAppUrl(tenantId, config.appDomain) };
}
