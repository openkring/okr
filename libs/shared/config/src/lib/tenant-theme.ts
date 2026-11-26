import { isValidTenantId } from './boot-tenant';

/**
 * The tenant's Ionic theme as a stylesheet loaded at start (spec 1.179, phase 1).
 *
 * A tenant app compiles its `theme/variables.scss` in. A runtime-tenant build cannot, so
 * `scripts/tenant-themes.mjs` copies every tenant's theme to `assets/tenant-themes/<tenantId>.css`
 * and the app loads the chosen one before bootstrap.
 */
const LINK_ID = 'okr-tenant-theme';
/** The start waits at most this long for the theme; then it continues with Ionic's default colours. */
export const TENANT_THEME_TIMEOUT_MS = 3000;

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
    let settled = false;
    const finish = (ok: boolean, why?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (why) console.error(`loadTenantTheme: ${link.getAttribute('href')} ${why}`);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false, `did not load within ${TENANT_THEME_TIMEOUT_MS} ms`), TENANT_THEME_TIMEOUT_MS);
    link.addEventListener('load', () => finish(true), { once: true });
    link.addEventListener('error', () => finish(false, 'did not load'), { once: true });
    doc.head.appendChild(link);
  });
}
