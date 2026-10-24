import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, firstValueFrom, map, of } from 'rxjs';
import { QueryDocumentSnapshot, collection, getDocs, limit, query, startAfter } from 'firebase/firestore';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DbQuery, DiaryCollection, DiaryModel, TripCollection, TripModel, UserModel } from '@okr/shared-models';
import { getQuery, getSystemQuery } from '@okr/shared-util-core';

import {
  DIARY_I18N_KEYS, DiaryRange, diaryAlbumKeys, diaryHeadlineSortKey, diaryKey, diaryNeighbourQuery, diaryNeighbourScope, diaryRangeBounds,
  stripLegacyDiaryFields, withDiaryLocations,
} from '@okr/content-diary-util';

/** Neighbour search pages: small, because the nearest hit is almost always in the first page. */
const NEIGHBOUR_PAGE = 5;
const NEIGHBOUR_MAX_PAGES = 10;

/**
 * Reads and writes the author's own diary entries.
 *
 * There is no tenant-wide list here and there never will be: `firestore.rules` allows read and
 * write on `diaries` only where `authorKey == request.auth.uid`, admin included.
 *
 * The READ rule is owner-only (`isDiaryOwner(resource.data)`, no tenant clause; spec 1.114 §3), so
 * a query is provable from `authorKey ==` alone. That is what lets the album queries
 * (`albumKeys array-contains`) run without a `tenants` constraint — they cannot carry both
 * `albumKeys` and `tenants` without a second array-contains. Such a query returns the entries of
 * every tenant the author wrote in, so `listByAlbum` / `newestAlbumDate` drop foreign tenants in
 * memory. The existing queries (`list`, `listByRange`, `findNeighbour`, ...) keep their `tenants`
 * constraint: they want only this tenant's entries, and it costs one composite index
 * (`authorKey` + `tenants`) rather than client-side filtering of 7'000 documents. WRITES still
 * check the tenant in the rules.
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
    trip_create_conf: DIARY_I18N_KEYS.albums_trip_create_conf,
    trip_create_error: DIARY_I18N_KEYS.albums_trip_create_error,
    trip_update_conf: DIARY_I18N_KEYS.albums_trip_update_conf,
    trip_update_error: DIARY_I18N_KEYS.albums_trip_update_error,
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
        .map(diary => withDiaryLocations(diary))
        .filter(diary => !diary.isArchived)
        .sort((a, b) => diaryHeadlineSortKey(b.date).localeCompare(diaryHeadlineSortKey(a.date)))),
    );
  }

  /** Writes back an edited entry — used by the reference screen to attach a location or a person. */
  public async update(diary: DiaryModel, currentUser?: UserModel): Promise<string | undefined> {
    const normalised = withDiaryLocations(diary);
    normalised.albumKeys = diaryAlbumKeys(normalised);
    diary.albumKeys = normalised.albumKeys;
    return await this.firestoreService.updateModel<DiaryModel>(
      DiaryCollection, stripLegacyDiaryFields(normalised), false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * One period of the author's entries (a year, a decade, a century — spec 1.106 §1.2), newest
   * first — or every year when `range` is undefined.
   *
   * The two equality constraints are the read rule (see the class comment) and stay in EVERY
   * variant; the date range is what keeps a 7'433-document collection from being streamed to a
   * phone for the list. A year holds at most ~370 documents (days + month aggregates + the year
   * aggregate — 'yyyy0000' sorts first and is inside the bounds). Range on a third field costs
   * the composite index `authorKey ASC, tenants CONTAINS, date ASC` (firestore.indexes.json).
   */
  public listByRange(authorKey: string, tenantId: string, range?: DiaryRange): Observable<DiaryModel[]> {
    if (!authorKey || !tenantId) return of([]);
    const dbQuery = this.ownerQuery(authorKey, tenantId);
    if (range !== undefined) {
      const { from, to } = diaryRangeBounds(range);
      dbQuery.push({ key: 'date', operator: '>=', value: from }, { key: 'date', operator: '<=', value: to });
    }
    return this.firestoreService.searchData<DiaryModel>(DiaryCollection, dbQuery, 'none').pipe(
      map(diaries => diaries
        .map(diary => withDiaryLocations(diary))
        .filter(diary => !diary.isArchived)
        .sort((a, b) => diaryHeadlineSortKey(b.date).localeCompare(diaryHeadlineSortKey(a.date)))),
    );
  }

  /**
   * The nearest older (`prev`) or newer (`next`) entry of the same scope as `current` — for a day
   * the previous/next day that HAS an entry, skipping aggregates and archived entries. Queried,
   * not taken from the loaded list: the list may be filtered to one year, and the neighbour of
   * its oldest day lies in the year before. `prev` orders `date DESC`, which needs its own
   * composite index (`authorKey`, `tenants`, `date DESC`).
   */
  public async findNeighbour(authorKey: string, tenantId: string, current: DiaryModel, direction: 'prev' | 'next'): Promise<DiaryModel | undefined> {
    if (!authorKey || !tenantId) return undefined;
    const scope = diaryNeighbourScope(current);
    const constraints = getQuery(diaryNeighbourQuery(authorKey, tenantId, current, direction), 'date', direction === 'prev' ? 'desc' : 'asc');
    let last: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < NEIGHBOUR_MAX_PAGES; page++) {
      const pageQuery = query(collection(this.firestoreService.firestore, DiaryCollection), ...constraints,
        ...(last ? [startAfter(last)] : []), limit(NEIGHBOUR_PAGE));
      const snapshot = await getDocs(pageQuery);
      const hit = snapshot.docs
        .map(d => withDiaryLocations({ ...d.data(), okey: d.id } as DiaryModel))
        .find(d => !d.isArchived && diaryNeighbourScope(d) === scope);
      if (hit) return hit;
      if (snapshot.docs.length < NEIGHBOUR_PAGE) return undefined;
      last = snapshot.docs[snapshot.docs.length - 1];
    }
    return undefined;
  }

  /**
   * The overview one level up (spec 1.106 §2.1): a day → its month aggregate, else its year
   * aggregate; a month aggregate → its year aggregate; a year → nothing. Archived counts as absent.
   */
  public async findUp(authorKey: string, tenantId: string, current: DiaryModel): Promise<DiaryModel | undefined> {
    const year = current.date.slice(0, 4);
    const scope = diaryNeighbourScope(current);
    const candidates = scope === 'day' ? [`${current.date.slice(0, 6)}00`, `${year}0000`]
      : scope === 'month' ? [`${year}0000`] : [];
    for (const date of candidates) {
      const found = await this.readOnce(diaryKey(tenantId, authorKey, date));
      if (found && !found.isArchived) return found;
    }
    return undefined;
  }

  /** The two equality constraints the read rule demands (see the class comment). */
  private ownerQuery(authorKey: string, tenantId: string): DbQuery[] {
    return [
      { key: 'authorKey', operator: '==', value: authorKey },
      { key: 'tenants', operator: 'array-contains', value: tenantId },
    ];
  }

  public read(key: string): Observable<DiaryModel | undefined> {
    return this.firestoreService.readModel<DiaryModel>(DiaryCollection, key).pipe(
      map(diary => diary ? withDiaryLocations(diary) : diary));
  }

  public async readOnce(key: string): Promise<DiaryModel | undefined> {
    return await firstValueFrom(this.read(key));
  }

  /**
   * `okey` is preset by `newDiary` to the deterministic author+date id, and `allowOverwrite` is on
   * because writing over an existing document is the intended behaviour here: `DiaryStore.add`
   * refuses a LIVE entry for that day itself (toast + open the editor) but deliberately lets an
   * ARCHIVED one be replaced, so a deleted day is not a dead end that can never be re-created.
   */
  public async create(diary: DiaryModel, currentUser?: UserModel): Promise<string | undefined> {
    const normalised = withDiaryLocations(diary);
    normalised.albumKeys = diaryAlbumKeys(normalised);
    diary.albumKeys = normalised.albumKeys;
    return await this.firestoreService.createModel<DiaryModel>(
      DiaryCollection, stripLegacyDiaryFields(normalised), this.i18n.create_conf(), this.i18n.create_error(), currentUser, false, true);
  }

  /**
   * The travel trips of the tenant, for the trip picker. Read here rather than through
   * `@okr/trip-data-access` so the diary block needs no `dependsOn: ['trip']` — `bka` has the
   * Logbuch switched off, and a catalogue edge would switch it on. `type == 'travel'` is part of
   * the query (not an in-memory filter): the rules make tracker trips owner-only and rules are
   * not filters, so every trips query must carry a `type` constraint. The composite index
   * `isArchived, tenants, type, startDate` serves it.
   */
  public listTravelTrips(tenantId: string): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(TripCollection, [...getSystemQuery(tenantId), { key: 'type', operator: '==', value: 'travel' }], 'startDate', 'desc');
  }

  /** Newest first by the headline sort key — aggregates (zeroed month/day) sort inside their period. */
  private newestFirst(diaries: DiaryModel[]): DiaryModel[] {
    return [...diaries].sort((a, b) => diaryHeadlineSortKey(b.date).localeCompare(diaryHeadlineSortKey(a.date)));
  }

  /**
   * Every non-archived entry of `authorKey` carrying the album key (`person.<k>`, `location.<k>`,
   * `event.<slug>`, `tag.<t>`), over ALL years, newest first. The query constrains `authorKey` and
   * `albumKeys` only (see the class comment); other tenants' entries are dropped here.
   */
  public listByAlbum(authorKey: string, tenantId: string, key: string): Observable<DiaryModel[]> {
    if (!authorKey || !tenantId || !key) return of([]);
    return this.firestoreService.searchData<DiaryModel>(DiaryCollection, [
      { key: 'authorKey', operator: '==', value: authorKey },
      { key: 'albumKeys', operator: 'array-contains', value: key },
    ], 'date', 'desc').pipe(
      map(diaries => diaries.map(diary => withDiaryLocations(diary)).filter(diary => !diary.isArchived && (diary.tenants ?? []).includes(tenantId))),
    );
  }

  /** The entries between two StoreDates, either bound '' = open. Same owner query as `listByRange`. */
  public listByDateRange(authorKey: string, tenantId: string, from: string, to: string): Observable<DiaryModel[]> {
    // both bounds open would stream the author's whole diary — callers must give at least one
    if (!authorKey || !tenantId || (!from && !to)) return of([]);
    const dbQuery = this.ownerQuery(authorKey, tenantId);
    if (from) dbQuery.push({ key: 'date', operator: '>=', value: from });
    if (to) dbQuery.push({ key: 'date', operator: '<=', value: to });
    return this.firestoreService.searchData<DiaryModel>(DiaryCollection, dbQuery, 'none').pipe(
      map(diaries => this.newestFirst(diaries.map(diary => withDiaryLocations(diary)).filter(diary => !diary.isArchived))),
    );
  }

  /**
   * The entries of a trip: those pointing at it by `tripKey`, plus those inside
   * `startDate..endDate` that have no `tripKey` at all. An in-span entry of ANOTHER trip is not
   * part of this one. De-duplicated by `okey`, newest first.
   */
  public listByTrip(authorKey: string, tenantId: string, trip: TripModel): Observable<DiaryModel[]> {
    if (!authorKey || !tenantId || !trip?.okey) return of([]);
    const tagged$ = this.firestoreService.searchData<DiaryModel>(DiaryCollection, [
      ...this.ownerQuery(authorKey, tenantId),
      { key: 'tripKey', operator: '==', value: trip.okey },
    ], 'none');
    // a trip without both dates has no span: querying would open the range and stream everything
    const inSpan$ = (trip.startDate && trip.endDate
      ? this.listByDateRange(authorKey, tenantId, trip.startDate, trip.endDate)
      : of([] as DiaryModel[]))
      .pipe(map(diaries => diaries.filter(diary => !diary.tripKey)));
    return combineLatest([tagged$, inSpan$]).pipe(
      map(([taggedRaw, inSpan]) => {
        const tagged = taggedRaw.map(diary => withDiaryLocations(diary));
        const byKey = new Map<string, DiaryModel>();
        for (const diary of [...tagged.filter(d => !d.isArchived), ...inSpan]) byKey.set(diary.okey, diary);
        return this.newestFirst([...byKey.values()]);
      }),
    );
  }

  /**
   * The date of the newest entry of the album `key`, or '' when there is none. Looks at the five
   * newest candidates only (same raw-query pattern as `findNeighbour`) and filters tenant and
   * archived in memory — good enough for the "last used" hint in the Albums list. '' means "none
   * found among the 5 newest" (or a failed read), NOT "the album has no entries": never use it as
   * an existence test.
   */
  public async newestAlbumDate(authorKey: string, tenantId: string, key: string): Promise<string> {
    if (!authorKey || !tenantId || !key) return '';
    const constraints = getQuery([
      { key: 'authorKey', operator: '==', value: authorKey },
      { key: 'albumKeys', operator: 'array-contains', value: key },
    ], 'date', 'desc');
    try {
      const snapshot = await getDocs(query(collection(this.firestoreService.firestore, DiaryCollection), ...constraints, limit(NEIGHBOUR_PAGE)));
      const hit = snapshot.docs
        .map(d => ({ ...d.data(), okey: d.id }) as DiaryModel)
        .find(d => !d.isArchived && (d.tenants ?? []).includes(tenantId));
      return hit?.date ?? '';
    } catch {
      return '';
    }
  }

  /** Creates a travel trip for the diary: `type` is forced to 'travel'. */
  public async createTravelTrip(trip: TripModel, currentUser?: UserModel): Promise<string | undefined> {
    trip.type = 'travel';
    return await this.firestoreService.createModel<TripModel>(
      TripCollection, trip, this.i18n.trip_create_conf(), this.i18n.trip_create_error(), currentUser);
  }

  public async updateTravelTrip(trip: TripModel, currentUser?: UserModel): Promise<string | undefined> {
    trip.type = 'travel';
    return await this.firestoreService.updateModel<TripModel>(
      TripCollection, trip, false, this.i18n.trip_update_conf(), this.i18n.trip_update_error(), currentUser);
  }
}
