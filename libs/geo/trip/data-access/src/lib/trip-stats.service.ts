import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';

export interface YearStats {
  okey?: string;   // document ID (year string e.g. '2026') — present when loaded via searchData
  totalKm: number;
  tripCount: number;
}

/** One document per (entityType, year): `stats_rollup/<boats|members>_<year>`. */
export interface StatsRollup {
  okey?: string;   // '<entityType>_<year>' — present when loaded via searchData
  entries: Record<string, { km: number; count: number }>;
}

@Injectable({ providedIn: 'root' })
export class TripStatsService {
  private readonly firestoreService = inject(FirestoreService);

  public getStats(entityType: 'boats' | 'members', key: string, year: number): Observable<YearStats | undefined> {
    return this.firestoreService.readObject<YearStats>(`stats_${entityType}/${key}/years`, String(year));
  }

  public getHistory(entityType: 'boats' | 'members', key: string): Observable<YearStats[]> {
    return this.firestoreService.searchData<YearStats>(`stats_${entityType}/${key}/years`, [], '__name__', 'asc');
  }

  /** The whole ranking for one year in a single document — see `stats_rollup` in functions/trip. */
  public getRollup(entityType: 'boats' | 'members', year: number): Observable<StatsRollup | undefined> {
    return this.firestoreService.readObject<StatsRollup>('stats_rollup', `${entityType}_${year}`);
  }

  /** Every year's rollup for one entity type — one query, used by the history graph. */
  public getRollupHistory(entityType: 'boats' | 'members'): Observable<StatsRollup[]> {
    return this.firestoreService.searchData<StatsRollup>('stats_rollup', [], '__name__', 'asc').pipe(
      map(docs => docs.filter(d => d.okey?.startsWith(`${entityType}_`)))
    );
  }
}
