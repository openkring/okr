import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { PersonDirectoryResult } from '@okr/subject-person-util';

interface SearchRequest {
  tenantId: string;
  firstName: string;
  lastName: string;
  location: string;
}

@Injectable({ providedIn: 'root' })
export class PersonDirectoryService {
  private readonly env = inject(ENV);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  async searchPerson(firstName: string, lastName: string, location = ''): Promise<PersonDirectoryResult[]> {
    const fn = httpsCallable<SearchRequest, { results: PersonDirectoryResult[] }>(
      this.functions,
      'searchChSearchPerson'
    );
    const result = await fn({ tenantId: this.env.tenantId, firstName, lastName, location });
    return result.data.results;
  }
}
