import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BankRuleCollection, BankRuleModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { BANK_RULE_I18N_KEYS } from '@okr/finance-bank-rule-util';

@Injectable({ providedIn: 'root' })
export class BankRuleService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly tenantId = this.env.tenantId;

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: BANK_RULE_I18N_KEYS.create_conf,
    create_error: BANK_RULE_I18N_KEYS.create_error,
    update_conf: BANK_RULE_I18N_KEYS.update_conf,
    update_error: BANK_RULE_I18N_KEYS.update_error,
    delete_conf: BANK_RULE_I18N_KEYS.delete_conf,
    delete_error: BANK_RULE_I18N_KEYS.delete_error,
  });

  public async create(rule: BankRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<BankRuleModel>(BankRuleCollection, rule,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  public async update(rule: BankRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BankRuleModel>(BankRuleCollection, rule, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  public async delete(rule: BankRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<BankRuleModel>(BankRuleCollection, rule,
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  private query(accountingTenantId: string) {
    return [...getSystemQuery(this.tenantId), { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId }];
  }

  public list(accountingTenantId: string): Observable<BankRuleModel[]> {
    return this.firestoreService.searchData<BankRuleModel>(BankRuleCollection, this.query(accountingTenantId), 'priority', 'desc');
  }

  public listOnce(accountingTenantId: string): Promise<BankRuleModel[]> {
    return this.firestoreService.getDataOnce<BankRuleModel>(BankRuleCollection, this.query(accountingTenantId), 'priority', 'desc');
  }
}
