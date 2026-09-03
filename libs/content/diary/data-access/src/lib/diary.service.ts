import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DiaryCollection, DiaryModel, UserModel } from '@okr/shared-models';

import { DIARY_I18N_KEYS } from '@okr/content-diary-util';

/**
 * Reads and writes the author's own diary entries.
 *
 * There is no tenant-wide list here and there never will be: `firestore.rules` allows read and
 * write on `diaries` only where `authorKey == request.auth.uid`, admin included.
 *
 * The query filters by uid AND tenant, and both are load-bearing. A LIST operation is not checked
 * per returned document — Firestore has to prove the read rule from the query's constraints alone,
 * and the rule is `isDiaryOwner(resource.data) && belongsToTenant(resource.data)`. Constraining
 * only `authorKey` leaves the tenant half unprovable, and the whole listener is refused with
 * "Missing or insufficient permissions" — including against an EMPTY collection, where no document
 * could possibly have failed. That is the trap: the error looks like bad data and is really a
 * query that does not mirror its rule. This costs one composite index (`authorKey` + `tenants`),
 * which is the price of the rule, not an optimisation choice.
 *
 * `isArchived` stays an in-memory filter: the rule does not mention it, so it buys nothing here.
 */
@Injectable({ providedIn: 'root' })
export class DiaryService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    update_conf: DIARY_I18N_KEYS.update_conf,
    update_error: DIARY_I18N_KEYS.update_error,
  });

  /**
   * Every non-archived diary of `authorKey` in `tenantId`, newest first.
   * Returns an empty stream for an empty uid — the caller is not signed in yet.
   */
  public list(authorKey: string, tenantId: string): Observable<DiaryModel[]> {
    return this.firestoreService.searchData<DiaryModel>(
      DiaryCollection, [
        { key: 'authorKey', operator: '==', value: authorKey },
        { key: 'tenants', operator: 'array-contains', value: tenantId },
      ], 'none'
    ).pipe(
      map(diaries => diaries
        .filter(diary => !diary.isArchived)
        .sort((a, b) => b.date.localeCompare(a.date))),
    );
  }

  /** Writes back an edited entry — used by the reference screen to attach a location or a person. */
  public async update(diary: DiaryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<DiaryModel>(
      DiaryCollection, diary, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }
}
