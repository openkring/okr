import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BookingLineCollection, BookingLineModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

@Injectable({ providedIn: 'root' })
export class BookingLineService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public list(accountingTenantId: string): Observable<BookingLineModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query, 'none');
  }

  /**
   * How many booking lines of the accounting tenant book on one of the given accounts.
   * One read of the tenant's lines plus an in-memory match: a Firestore `in` clause caps at 30
   * values, and a deleted account subtree easily exceeds that.
   * @param accountKeys the account okeys to look for — an empty list is never in use.
   */
  public async countByAccountKeys(accountingTenantId: string, accountKeys: string[]): Promise<number> {
    if (accountKeys.length === 0) return 0;
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    const lines = await this.firestoreService.getDataOnce<BookingLineModel>(BookingLineCollection, query, 'none');
    const keys = new Set(accountKeys);
    return lines.filter(line => keys.has(line.accountKey)).length;
  }
}
