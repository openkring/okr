import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { OcrRuleCollection, OcrRuleModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class OcrRuleService {
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

  public async create(rule: OcrRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<OcrRuleModel>(
      OcrRuleCollection, rule,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser,
    );
  }

  public read(key: string): Observable<OcrRuleModel | undefined> {
    return findByKey<OcrRuleModel>(this.list(), key);
  }

  public async update(rule: OcrRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<OcrRuleModel>(
      OcrRuleCollection, rule, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser,
    );
  }

  public async delete(rule: OcrRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<OcrRuleModel>(
      OcrRuleCollection, rule,
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser,
    );
  }

  /** Tenant-scoped list (OcrRuleModel has no accountingTenantId — scoped by tenants[] only). */
  public list(orderBy = 'ocrUsage', sortOrder = 'asc'): Observable<OcrRuleModel[]> {
    const query = [...getSystemQuery(this.tenantId)];
    return this.firestoreService.searchData<OcrRuleModel>(OcrRuleCollection, query, orderBy, sortOrder);
  }
}
