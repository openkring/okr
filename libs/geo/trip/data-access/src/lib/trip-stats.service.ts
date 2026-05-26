import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';

export interface YearStats {
  bkey?: string;   // document ID (year string e.g. '2026') — present when loaded via searchData
  totalKm: number;
  tripCount: number;
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
}
