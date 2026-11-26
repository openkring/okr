import { isValidTenantId } from './boot-tenant';

/**
 * The tenant's Ionic theme as a stylesheet loaded at start (spec 1.179, phase 1).
 *
 * A tenant app compiles its `theme/variables.scss` in. A runtime-tenant build cannot, so
 * `scripts/tenant-themes.mjs` copies every tenant's theme to `assets/tenant-themes/<tenantId>.css`
 * and the app loads the chosen one before bootstrap.
 */
const LINK_ID = 'okr-tenant-theme';

export function tenantThemeHref(tenantId: string): string {
  if (!isValidTenantId(tenantId)) throw new Error(`tenantThemeHref: invalid tenant id ${JSON.stringify(tenantId)}`);
  return `assets/tenant-themes/${tenantId}.css`;
}

/**
 * Adds (or replaces) the tenant stylesheet in `head`. Resolves true once it loaded, false when it
 * failed or the id is invalid; the app then starts with Ionic's default colours.
 */
export function loadTenantTheme(doc: Document, tenantId: string): Promise<boolean> {
  if (!isValidTenantId(tenantId)) {
    console.error(`loadTenantTheme: invalid tenant id ${JSON.stringify(tenantId)}`);
    return Promise.resolve(false);
  }
  doc.getElementById(LINK_ID)?.remove();
  const link = doc.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = tenantThemeHref(tenantId);
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => {
      console.error(`loadTenantTheme: ${link.getAttribute('href')} did not load`);
      resolve(false);
    }, { once: true });
    doc.head.appendChild(link);
  });
}
