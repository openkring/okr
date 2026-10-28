import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { NON_TRACKER_TRIP_TYPES, TripCollection, TripModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { aggregateTripStats, getQuarterDateRange, Quarter } from '@okr/trip-util';

export type { Quarter } from '@okr/trip-util';

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
  private readonly env = inject(ENV);

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

  /**
   * The ranking for one quarter of a year. There is no quarterly rollup document, so this reads the
   * quarter's trips and aggregates them with the same counting rules the yearly rollup uses.
   * Quarter 0 ('Alle') reads the yearly rollup instead.
   */
  public getQuarterRollup(entityType: 'boats' | 'members', year: number, quarter: Quarter): Observable<StatsRollup | undefined> {
    if (quarter === 0) return this.getRollup(entityType, year);
    const { from, to } = getQuarterDateRange(year, quarter);
    return this.firestoreService.searchData<TripModel>(TripCollection, [
      ...getSystemQuery(this.env.tenantId),
      { key: 'type', operator: 'in', value: NON_TRACKER_TRIP_TYPES },
      { key: 'startDate', operator: '>=', value: from },
      { key: 'startDate', operator: '<=', value: to },
    ], 'startDate', 'desc').pipe(
      map(trips => ({ okey: `${entityType}_${year}_Q${quarter}`, entries: aggregateTripStats(trips, entityType) }))
    );
  }

  /** Every year's rollup for one entity type — one query, used by the history graph. */
  public getRollupHistory(entityType: 'boats' | 'members'): Observable<StatsRollup[]> {
    return this.firestoreService.searchData<StatsRollup>('stats_rollup', [], '__name__', 'asc').pipe(
      map(docs => docs.filter(d => d.okey?.startsWith(`${entityType}_`)))
    );
  }
}
