import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingCollection, BookingLineCollection, BookingLineModel, BookingModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { AccountBalanceEntry, aggregateAccountBalances, downloadCsv, exportToCsv } from '@bk2/finance-reporting-util';

@Injectable({ providedIn: 'root' })
export class ReportingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public getJournalEntries(accountingTenantId: string, orderBy = 'date', sortOrder = 'desc'): Observable<BookingModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
      { key: 'status', operator: '==' as const, value: 'posted' },
    ];
    return this.firestoreService.searchData<BookingModel>(BookingCollection, query, orderBy, sortOrder);
  }

  public getAllLines(accountingTenantId: string): Observable<BookingLineModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query);
  }

  public async getAccountBalances(accountingTenantId: string): Promise<AccountBalanceEntry[]> {
    const lines = await firstValueFrom(this.getAllLines(accountingTenantId));
    return aggregateAccountBalances(lines);
  }

  public async exportBalancesToCsv(accountingTenantId: string): Promise<void> {
    const balances = await this.getAccountBalances(accountingTenantId);
    const csv = exportToCsv(balances);
    downloadCsv(csv, `account-balances-${accountingTenantId}.csv`);
  }
}
