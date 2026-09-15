import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AssetCollection, AssetModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'asset.create.conf',
    create_error: PFX + 'asset.create.error',
    update_conf: PFX + 'asset.update.conf',
    update_error: PFX + 'asset.update.error',
    delete_conf: PFX + 'asset.delete.conf',
    delete_error: PFX + 'asset.delete.error',
  });
  private readonly tenantId = this.env.tenantId;

  public async create(asset: AssetModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetModel>(
      AssetCollection, asset,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<AssetModel | undefined> {
    return findByKey<AssetModel>(this.list(accountingTenantId), key);
  }

  public async update(asset: AssetModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AssetModel>(
      AssetCollection, asset, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async delete(asset: AssetModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AssetModel>(
      AssetCollection, asset,
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'assetNo', sortOrder = 'asc'): Observable<AssetModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetModel>(AssetCollection, query, orderBy, sortOrder);
  }
}
