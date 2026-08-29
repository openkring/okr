import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { WeatherCollection, WeatherModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

/**
 * Read-only access to the `weather` collection.
 *
 * Nothing in the app writes weather: the documents are produced by the scheduled Cloud
 * Function `scheduledWeatherFetch`, and the client never talks to the provider directly.
 * That is why this service has no create/update/delete — the Firestore rules deny client
 * writes to this collection outright.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  /**
   * Weather documents for one location, oldest first.
   *
   * @param locationKey the location's `okey`
   * @param fromDate    StoreDate (yyyy-mm-dd), inclusive — usually today for a forecast,
   *                    an earlier date to read the archive
   * @param toDate      StoreDate, inclusive
   */
  public list(locationKey: string, fromDate: string, toDate: string): Observable<WeatherModel[]> {
    const query = getSystemQuery(this.tenantId);
    query.push({ key: 'locationKey', operator: '==', value: locationKey });
    query.push({ key: 'date', operator: '>=', value: fromDate });
    query.push({ key: 'date', operator: '<=', value: toDate });
    return this.firestoreService.searchData<WeatherModel>(WeatherCollection, query, 'date', 'asc');
  }

  /**
   * Weather for several locations on a single day — the `map` widget's query.
   *
   * Firestore caps `in` at 30 values; the widget allows at most 10 locations, so a single
   * query is always enough. The cap is asserted by the section validation, not here.
   */
  public listForDate(locationKeys: string[], date: string): Observable<WeatherModel[]> {
    const query = getSystemQuery(this.tenantId);
    query.push({ key: 'locationKey', operator: 'in', value: locationKeys });
    query.push({ key: 'date', operator: '==', value: date });
    return this.firestoreService.searchData<WeatherModel>(WeatherCollection, query, 'locationKey', 'asc');
  }
}
