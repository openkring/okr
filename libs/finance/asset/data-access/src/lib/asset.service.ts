import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AssetCollection, AssetModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(asset: AssetModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetModel>(
      AssetCollection, asset,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<AssetModel | undefined> {
    return findByKey<AssetModel>(this.list(accountingTenantId), key);
  }

  public async update(asset: AssetModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AssetModel>(
      AssetCollection, asset, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(asset: AssetModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AssetModel>(
      AssetCollection, asset,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
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
