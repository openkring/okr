import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AddressDirectoryCollection, AddressDirectoryModel, getAddressDirectoryKey } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/**
 * Client read access to the address-directory projection (spec 1.19 Phase 4):
 * the CF-materialized, registered-visible contact data per parent × tenant.
 * Read-only by design — the collection is client-write-denied in the rules;
 * every write happens in the replication Cloud Functions.
 */
@Injectable({
  providedIn: 'root'
})
export class AddressDirectoryService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /**
   * The projection doc of one parent for the current tenant (realtime stream).
   * @param parentKey 'person.<okey>' or 'org.<okey>'
   */
  public read(parentKey: string): Observable<AddressDirectoryModel | undefined> {
    return this.firestoreService.readModel<AddressDirectoryModel>(
      AddressDirectoryCollection, getAddressDirectoryKey(this.env.tenantId, parentKey));
  }

  /** All projection docs of the current tenant (the AppStore bulk stream uses the same query). */
  public list(): Observable<AddressDirectoryModel[]> {
    return this.firestoreService.searchData<AddressDirectoryModel>(
      AddressDirectoryCollection, getSystemQuery(this.env.tenantId), 'none');
  }
}
