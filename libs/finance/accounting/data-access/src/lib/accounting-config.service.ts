import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AccountingConfigCollection, AccountingConfigModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AccountingConfigService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AccountingConfigModel>(
      AccountingConfigCollection, config,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(accountingTenantId: string): Observable<AccountingConfigModel | undefined> {
    return findByKey<AccountingConfigModel>(this.listForTenant(), accountingTenantId);
  }

  public async update(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<AccountingConfigModel>(
      AccountingConfigCollection, config, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<AccountingConfigModel>(
      AccountingConfigCollection, config,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public listForTenant(orderBy = 'bkey', sortOrder = 'asc'): Observable<AccountingConfigModel[]> {
    return this.firestoreService.searchData<AccountingConfigModel>(
      AccountingConfigCollection, getSystemQuery(this.tenantId), orderBy, sortOrder
    );
  }
}
