import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { HearingQuizResultCollection, HearingQuizResultModel, UserModel } from '@okr/shared-models';

/**
 * The signed-in user's OWN training results (`hearingQuizResults`) — health data (spec §10).
 *
 * The query filters by uid AND tenant, and both are load-bearing: the read rule is
 * `userKey == request.auth.uid && belongsToTenant(...)`, and Firestore must prove it from the
 * query's constraints alone (same shape and same composite index as `DiaryService.list`).
 * There is no tenant-wide list here and there never will be.
 *
 * Nothing is written to the activity log: that the user trains at all is the sensitive fact.
 */
@Injectable({ providedIn: 'root' })
export class HearingQuizResultService {
  private readonly firestoreService = inject(FirestoreService);

  public listMine(userKey: string, tenantId: string): Observable<HearingQuizResultModel[]> {
    if (!userKey || !tenantId) return of([]);
    return this.firestoreService.searchData<HearingQuizResultModel>(
      HearingQuizResultCollection, [
        { key: 'userKey', operator: '==', value: userKey },
        { key: 'tenants', operator: 'array-contains', value: tenantId },
      ], 'none',
    ).pipe(map(results => results.filter(r => !r.isArchived)));
  }

  /**
   * Record one result. Silent on success AND on failure (no toast): a lost result must never
   * interrupt an exercise. While offline, Firestore queues the write and syncs it later.
   */
  public async save(result: HearingQuizResultModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<HearingQuizResultModel>(
      HearingQuizResultCollection, result, undefined, undefined, currentUser, true);
  }
}
