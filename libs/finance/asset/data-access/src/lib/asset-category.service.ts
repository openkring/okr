import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AssetCategoryCollection, AssetCategoryModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetCategoryService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'category.create.conf',
    create_error: PFX + 'category.create.error',
    update_conf: PFX + 'category.update.conf',
    update_error: PFX + 'category.update.error',
    delete_conf: PFX + 'category.delete.conf',
    delete_error: PFX + 'category.delete.error',
  });
  private readonly tenantId = this.env.tenantId;

  public async create(category: AssetCategoryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetCategoryModel>(
      AssetCategoryCollection, category,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<AssetCategoryModel | undefined> {
    return findByKey<AssetCategoryModel>(this.list(accountingTenantId), key);
  }

  public async update(category: AssetCategoryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AssetCategoryModel>(
      AssetCategoryCollection, category, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async delete(category: AssetCategoryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AssetCategoryModel>(
      AssetCategoryCollection, category,
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
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
