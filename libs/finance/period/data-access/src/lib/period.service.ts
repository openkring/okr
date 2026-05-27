import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PeriodCollection, PeriodModel, UserModel } from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat, getTodayStr, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PeriodService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(period: PeriodModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PeriodModel>(
      PeriodCollection, period,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public async update(period: PeriodModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<PeriodModel>(
      PeriodCollection, period, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'year', sortOrder = 'desc'): Observable<PeriodModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PeriodModel>(PeriodCollection, query, orderBy, sortOrder);
  }

  public async lock(period: PeriodModel, currentUser: UserModel): Promise<string | undefined> {
    period.isLocked = true;
    period.lockedBy = currentUser.bkey ?? '';
    period.lockedAt = convertDateFormatToString(getTodayStr(DateFormat.IsoDate), DateFormat.IsoDate, DateFormat.StoreDate);
    return await this.update(period, currentUser);
  }

  public async unlock(period: PeriodModel, currentUser: UserModel): Promise<string | undefined> {
    period.isLocked = false;
    period.lockedBy = '';
    period.lockedAt = '';
    return await this.update(period, currentUser);
  }
}
