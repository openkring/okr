import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AssetCategoryCollection, AssetCategoryModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetCategoryService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(category: AssetCategoryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetCategoryModel>(
      AssetCategoryCollection, category,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<AssetCategoryModel | undefined> {
    return findByKey<AssetCategoryModel>(this.list(accountingTenantId), key);
  }

  public async update(category: AssetCategoryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AssetCategoryModel>(
      AssetCategoryCollection, category, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(category: AssetCategoryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AssetCategoryModel>(
      AssetCategoryCollection, category,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'name', sortOrder = 'asc'): Observable<AssetCategoryModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetCategoryModel>(AssetCategoryCollection, query, orderBy, sortOrder);
  }
}
