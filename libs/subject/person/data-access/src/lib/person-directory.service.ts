import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { PersonDirectoryResult } from '@okr/subject-person-util';

// `tenantId` is no longer sent: the callable runs on the external-data gateway
// (1.18), which derives the tenant from users/{uid}.tenants[0] server-side. A
// client-supplied value was never a boundary — it was checked, then used.
interface SearchRequest {
  firstName: string;
  lastName: string;
  location: string;
}

/** The gateway envelope: payload under `data`, plus attribution/freshness. */
interface GatewayEnvelope<T> {
  data: T;
  attribution: { provider: string; url: string; licence?: string };
  sourceTimestamp: string | null;
  cached: boolean;
}

@Injectable({ providedIn: 'root' })
export class PersonDirectoryService {
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  async searchPerson(firstName: string, lastName: string, location = ''): Promise<PersonDirectoryResult[]> {
    const fn = httpsCallable<SearchRequest, GatewayEnvelope<{ results: PersonDirectoryResult[] }>>(
      this.functions,
      'searchChSearchPerson'
    );
    const result = await fn({ firstName, lastName, location });
    return result.data.data.results;
  }
}
