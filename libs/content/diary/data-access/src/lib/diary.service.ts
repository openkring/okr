import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, map, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DbQuery, DiaryCollection, DiaryModel, TripCollection, TripModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { DIARY_I18N_KEYS, diaryHeadlineSortKey, diaryYearBounds } from '@okr/content-diary-util';

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
    create_conf: DIARY_I18N_KEYS.create_conf,
    create_error: DIARY_I18N_KEYS.create_error,
    delete_conf: DIARY_I18N_KEYS.delete_conf,
    delete_error: DIARY_I18N_KEYS.delete_error,
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
        .sort((a, b) => diaryHeadlineSortKey(b.date).localeCompare(diaryHeadlineSortKey(a.date)))),
    );
  }

  /** Writes back an edited entry — used by the reference screen to attach a location or a person. */
  public async update(diary: DiaryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<DiaryModel>(
      DiaryCollection, diary, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * One year of the author's entries, newest first — or every year when `year` is undefined.
   *
   * The two equality constraints are the read rule (see the class comment) and stay in EVERY
   * variant; the date range is what keeps a 7'433-document collection from being streamed to a
   * phone for the list. A year holds at most ~370 documents (days + month aggregates + the year
   * aggregate — 'yyyy0000' sorts first and is inside the bounds). Range on a third field costs
   * the composite index `authorKey ASC, tenants CONTAINS, date ASC` (firestore.indexes.json).
   */
  public listByYear(authorKey: string, tenantId: string, year?: number): Observable<DiaryModel[]> {
    if (!authorKey || !tenantId) return of([]);
    const query: DbQuery[] = [
      { key: 'authorKey', operator: '==', value: authorKey },
      { key: 'tenants', operator: 'array-contains', value: tenantId },
    ];
    if (year !== undefined) {
      const { from, to } = diaryYearBounds(year);
      query.push({ key: 'date', operator: '>=', value: from }, { key: 'date', operator: '<=', value: to });
    }
    return this.firestoreService.searchData<DiaryModel>(DiaryCollection, query, 'none').pipe(
      map(diaries => diaries
        .filter(diary => !diary.isArchived)
        .sort((a, b) => diaryHeadlineSortKey(b.date).localeCompare(diaryHeadlineSortKey(a.date)))),
    );
  }

  public read(key: string): Observable<DiaryModel | undefined> {
    return this.firestoreService.readModel<DiaryModel>(DiaryCollection, key);
  }

  public async readOnce(key: string): Promise<DiaryModel | undefined> {
    return await firstValueFrom(this.read(key));
  }

  /** `okey` is preset by `newDiary` to the deterministic id; createModel keeps it (setDoc). */
  public async create(diary: DiaryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<DiaryModel>(
      DiaryCollection, diary, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /** Archive, never a hard delete — deleteModel applies the tenant-aware patch (deleting-models skill). */
  public async delete(diary: DiaryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<DiaryModel>(
      DiaryCollection, diary, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /**
   * The travel trips of the tenant, for the trip picker. Read here rather than through
   * `@okr/trip-data-access` so the diary block needs no `dependsOn: ['trip']` — `bka` has the
   * Logbuch switched off, and a catalogue edge would switch it on. `type` is filtered in memory:
   * array-contains-any + equality would need one more composite index for ~40 documents.
   */
  public listTravelTrips(tenantId: string): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(TripCollection, getSystemQuery(tenantId), 'startDate', 'desc')
      .pipe(map(trips => trips.filter(trip => trip.type === 'travel')));
  }
}
