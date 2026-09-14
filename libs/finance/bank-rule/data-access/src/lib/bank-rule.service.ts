import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BankRuleCollection, BankRuleModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { BANK_RULE_I18N_KEYS } from '@okr/finance-bank-rule-util';

@Injectable({ providedIn: 'root' })
export class BankRuleService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(rule: BankRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<BankRuleModel>(BankRuleCollection, rule,
      BANK_RULE_I18N_KEYS.create_conf, BANK_RULE_I18N_KEYS.create_error, currentUser);
  }

  public async update(rule: BankRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BankRuleModel>(BankRuleCollection, rule, false,
      BANK_RULE_I18N_KEYS.update_conf, BANK_RULE_I18N_KEYS.update_error, currentUser);
  }

  public async delete(rule: BankRuleModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<BankRuleModel>(BankRuleCollection, rule,
      BANK_RULE_I18N_KEYS.delete_conf, BANK_RULE_I18N_KEYS.delete_error, currentUser);
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
