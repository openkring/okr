import { Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { activeFirebaseApp } from '@okr/shared-config';

/** Which Hosting site to ask for: the tenant's app, or a website (`websites/{siteId}`). */
export type HostingKind = 'app' | 'website';

/** One host a Hosting site answers on; mirrors apps/functions/src/website/hosting-domains.ts. */
export interface HostingDomain {
  host: string;
  /** a built-in Firebase host (`*.web.app`, `*.firebaseapp.com`) */
  internal: boolean;
  active: boolean;
  redirectTo?: string;
}

export interface HostingDomainsResult {
  site: string;
  domains: HostingDomain[];
}

/** Reads the domains of a Hosting site through the `getHostingDomains` callable (contentAdmin). */
@Injectable({ providedIn: 'root' })
export class HostingDomainsService {
  public async list(kind: HostingKind, siteId = ''): Promise<HostingDomainsResult> {
    const fn = httpsCallable<{ kind: HostingKind; siteId?: string }, HostingDomainsResult>(
      getFunctions(activeFirebaseApp(), 'europe-west6'), 'getHostingDomains');
    return (await fn(kind === 'website' ? { kind, siteId } : { kind })).data;
  }
}
