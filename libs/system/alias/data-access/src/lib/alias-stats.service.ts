import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AliasStatsCollection, AliasStatsModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/**
 * Die Tagesaggregate eines Alias (`trackingLevel: 'counter'` und höher).
 *
 * Lesend — geschrieben wird ausschliesslich vom Resolver mit dem Admin SDK
 * (`allow write: if false`). Ein Client, der hier schreiben könnte, könnte die Wirkung eines
 * Plakats erfinden.
 */
@Injectable({ providedIn: 'root' })
export class AliasStatsService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /**
   * Die Aggregate eines Alias ab einem Kalendertag (`yyyy-MM-dd`), aufsteigend.
   *
   * `fromDate` ist eine Zeichenkette und wird lexikografisch verglichen — bei ISO-Daten ist das
   * dasselbe wie chronologisch, deshalb braucht es keinen Timestamp und keinen zweiten Index.
   */
  public listForAlias(aliasKey: string, fromDate: string): Observable<AliasStatsModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'aliasKey', operator: '==', value: aliasKey });
    query.push({ key: 'date', operator: '>=', value: fromDate });
    return this.firestoreService.searchData<AliasStatsModel>(AliasStatsCollection, query, 'date', 'asc');
  }
}
