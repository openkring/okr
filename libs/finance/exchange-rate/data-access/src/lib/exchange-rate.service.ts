import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { CurrencyCode, ExchangeRateCollection, ExchangeRateModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { pickClosestRate } from '@okr/finance-exchange-rate-util';

@Injectable({ providedIn: 'root' })
export class ExchangeRateService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public listForPair(
    from: CurrencyCode,
    to: CurrencyCode,
    orderBy = 'date',
    sortOrder = 'desc'
  ): Observable<ExchangeRateModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'fromCurrency', operator: '==' as const, value: from },
      { key: 'toCurrency',   operator: '==' as const, value: to   },
    ];
    return this.firestoreService.searchData<ExchangeRateModel>(ExchangeRateCollection, query, orderBy, sortOrder);
  }

  public resolveRateForDate(rates: ExchangeRateModel[], storeDate: string): ExchangeRateModel | undefined {
    return pickClosestRate(rates, storeDate);
  }
}
