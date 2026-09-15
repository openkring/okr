import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { PeriodCollection, PeriodModel, UserModel } from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getTodayStr, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PeriodService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
  });
  private readonly tenantId = this.env.tenantId;

  public async create(period: PeriodModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PeriodModel>(
      PeriodCollection, period,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async update(period: PeriodModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<PeriodModel>(
      PeriodCollection, period, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser
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
    period.lockedBy = currentUser.okey ?? '';
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
