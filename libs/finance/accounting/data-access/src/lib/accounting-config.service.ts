import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AccountingConfigCollection, AccountingConfigModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AccountingConfigService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });
  private readonly tenantId = this.env.tenantId;

  public async create(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AccountingConfigModel>(
      AccountingConfigCollection, config,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public read(accountingTenantId: string): Observable<AccountingConfigModel | undefined> {
    return findByKey<AccountingConfigModel>(this.listForTenant(), accountingTenantId);
  }

  public async update(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<AccountingConfigModel>(
      AccountingConfigCollection, config, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async delete(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<AccountingConfigModel>(
      AccountingConfigCollection, config,
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public listForTenant(orderBy = 'okey', sortOrder = 'asc'): Observable<AccountingConfigModel[]> {
    return this.firestoreService.searchData<AccountingConfigModel>(
      AccountingConfigCollection, getSystemQuery(this.tenantId), orderBy, sortOrder
    );
  }
}
