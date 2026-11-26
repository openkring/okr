import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { LedgerBalanceCollection, LedgerBalanceModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

const REGION = 'europe-west6';

/** What `ledger` › `refreshLedgerBalances` answers (apps/functions/src/ledger/refresh-ledger-balances.ts). */
export interface LedgerRefreshResult {
  accountingTenantId: string;
  computedAt: string;
  full: boolean;
  recomputed: number[];
  reused: number[];
  skipped: number[];
  changedLockedYears: number[];
  countsMatch: boolean;
}

/**
 * Ledger balances of a set of books (spec 1.177): one small document per calendar year, written only by the
 * `ledger` function. The reports listen to these instead of the whole ledger.
 */
@Injectable({ providedIn: 'root' })
export class LedgerBalanceService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = inject(ENV).tenantId;

  /** The year documents of the books, live (≤ 10 small documents; the view's main content, readable offline). */
  public list(accountingTenantId: string): Observable<LedgerBalanceModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    // 'none': the documents have no `name` — the default orderBy('name') would drop every one
    return this.firestoreService.searchData<LedgerBalanceModel>(LedgerBalanceCollection, query, 'none');
  }

  /** Recomputes the balances on the server; `full` skips the reuse of locked years. Rejects on failure or offline. */
  public async refresh(accountingTenantId: string, full = false): Promise<LedgerRefreshResult> {
    const fn = httpsCallable<{ op: string; accountingTenantId: string; full: boolean }, LedgerRefreshResult>(getFunctions(getApp(), REGION), 'ledger');
    const { data } = await fn({ op: 'refreshLedgerBalances', accountingTenantId, full });
    return data;
  }
}
