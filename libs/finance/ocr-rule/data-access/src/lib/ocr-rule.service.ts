import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { OcrRuleCollection, OcrRuleModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class OcrRuleService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(rule: OcrRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<OcrRuleModel>(
      OcrRuleCollection, rule,
      PFX + 'create.conf', PFX + 'create.error', currentUser,
    );
  }

  public read(key: string): Observable<OcrRuleModel | undefined> {
    return findByKey<OcrRuleModel>(this.list(), key);
  }

  public async update(rule: OcrRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<OcrRuleModel>(
      OcrRuleCollection, rule, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser,
    );
  }

  public async delete(rule: OcrRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<OcrRuleModel>(
      OcrRuleCollection, rule,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser,
    );
  }

  /** Tenant-scoped list (OcrRuleModel has no accountingTenantId — scoped by tenants[] only). */
  public list(orderBy = 'ocrUsage', sortOrder = 'asc'): Observable<OcrRuleModel[]> {
    const query = [...getSystemQuery(this.tenantId)];
    return this.firestoreService.searchData<OcrRuleModel>(OcrRuleCollection, query, orderBy, sortOrder);
  }
}
