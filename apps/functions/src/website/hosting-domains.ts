// getHostingDomains: every host a tenant's Hosting site answers on — its custom domains (with status and
// redirect) and the two built-in `<site>.web.app` / `<site>.firebaseapp.com` hosts. Shown above the segments
// of the app sitemap (kind 'app') and the website sitemap (kind 'website').
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { listSiteDomains, type SiteDomainInfo } from './hosting-client';
import { authorizeSite, isWebsiteHostingSite, PUBLISH_ROLES } from './publish-website';

const REGION = 'europe-west6';
/** Every tenant app is served from `<tenantId>-app-54aef` (firebase.json); the app config does not store the site id. */
export const APP_HOSTING_SITE_SUFFIX = '-app-54aef';
const APP_HOSTING_SITE = /^[a-z0-9-]+-app-[a-z0-9]+$/;

export type HostingKind = 'app' | 'website';

export interface HostingDomain {
  host: string;
  /** a built-in Firebase host (`*.web.app`, `*.firebaseapp.com`) rather than a custom domain */
  internal: boolean;
  /** serving: the domain is active (always true for the built-in hosts) */
  active: boolean;
  /** the host this domain redirects to, when it only redirects */
  redirectTo?: string;
}

export interface HostingDomainsResult {
  site: string;
  domains: HostingDomain[];
}

export function appHostingSite(tenantId: string): string {
  return `${tenantId.toLowerCase()}${APP_HOSTING_SITE_SUFFIX}`;
}

export function isAppHostingSite(site: unknown): site is string {
  return typeof site === 'string' && APP_HOSTING_SITE.test(site);
}

/** Custom domains first (serving hosts before redirects, then alphabetical), then the two built-in hosts. */
export function toHostingDomains(site: string, custom: SiteDomainInfo[]): HostingDomain[] {
  const own = custom
    .filter((d) => !!d.domainName)
    .map((d): HostingDomain => ({
      host: d.domainName.toLowerCase(),
      internal: false,
      active: d.status === 'DOMAIN_ACTIVE',
      ...(d.domainRedirect?.domainName ? { redirectTo: d.domainRedirect.domainName.toLowerCase() } : {}),
    }))
    .sort((a, b) => Number(!!a.redirectTo) - Number(!!b.redirectTo) || a.host.localeCompare(b.host));
  const builtIn: HostingDomain[] = [`${site}.web.app`, `${site}.firebaseapp.com`].map((host) => ({ host, internal: true, active: true }));
  return [...own, ...builtIn];
}

export const getHostingDomains = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ kind?: unknown; siteId?: unknown }>): Promise<HostingDomainsResult> => {
    const CF_NAME = 'getHostingDomains';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, PUBLISH_ROLES);
    const kind = request.data?.kind;
    let site: string;
    if (kind === 'app') {
      site = appHostingSite(await getCallerTenantId(request as never, CF_NAME));
      if (!isAppHostingSite(site)) throw new HttpsError('failed-precondition', 'hostingSiteInvalid');
    } else if (kind === 'website') {
      const { site: website } = await authorizeSite(getFirestore(), request, CF_NAME, request.data?.siteId);
      if (!isWebsiteHostingSite(website.hostingSite)) throw new HttpsError('failed-precondition', 'hostingSiteInvalid');
      site = website.hostingSite;
    } else {
      throw new HttpsError('invalid-argument', 'kind must be app or website');
    }
    try {
      return { site, domains: toHostingDomains(site, await listSiteDomains(site)) };
    } catch (e) {
      // a site without custom domains still answers on its built-in hosts
      logger.error(`${CF_NAME}: domains of ${site} not readable: ${e instanceof Error ? e.message : String(e)}`);
      return { site, domains: toHostingDomains(site, []) };
    }
  },
);
