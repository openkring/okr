import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { FeatureRolloutCollection, FeatureRolloutModel } from '@okr/shared-models';

/**
 * Reads the operator-owned rollout documents. `feature-rollout` is a GLOBAL collection,
 * not tenant-scoped: one document per catalogue block id, owned by the operator — so
 * unlike almost every other read in this repo, this must NOT filter by tenantId/tenants
 * (the model carries no `tenants` field). A missing doc is not an error — `resolveAvailability`
 * falls back to the block's `defaultAvailability` (D-BB-10).
 *
 * `orderByParam` is explicitly set to 'none': `FirestoreService.searchData` defaults to
 * ordering by a `name` field, which `FeatureRolloutModel` does not have — Firestore's
 * `orderBy` excludes documents missing the ordered field, which would silently return an
 * empty list. Sort client-side (e.g. by catalogue order) if a specific order is needed.
 */
@Injectable({ providedIn: 'root' })
export class FeatureRolloutService {
  private readonly firestoreService = inject(FirestoreService);

  public list(): Observable<FeatureRolloutModel[]> {
    return this.firestoreService.searchData<FeatureRolloutModel>(FeatureRolloutCollection, [], 'none');
  }
}
