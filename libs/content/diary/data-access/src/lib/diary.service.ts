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
 * write on `diaries` only where `authorKey == request.auth.uid`, admin included. So the query
 * below filters by the caller's uid and NOTHING else server-side — a single equality filter,
 * which Firestore serves from its automatic single-field index. `isArchived` and the tenant are
 * applied in memory instead of as extra `where` clauses, because adding them would demand a
 * composite index for a collection that only ever holds one person's own entries.
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
      DiaryCollection, [{ key: 'authorKey', operator: '==', value: authorKey }], 'none'
    ).pipe(
      map(diaries => diaries
        .filter(diary => !diary.isArchived && (diary.tenants ?? []).includes(tenantId))
        .sort((a, b) => b.date.localeCompare(a.date))),
    );
  }

  /** Writes back an edited entry — used by the reference screen to attach a location or a person. */
  public async update(diary: DiaryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<DiaryModel>(
      DiaryCollection, diary, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }
}
