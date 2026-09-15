import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BankFormat, BankProfileCollection, BankProfileModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { BANK_PROFILE_I18N_KEYS } from '@okr/finance-bank-profile-util';

@Injectable({ providedIn: 'root' })
export class BankProfileService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly tenantId = this.env.tenantId;

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: BANK_PROFILE_I18N_KEYS.create_conf,
    create_error: BANK_PROFILE_I18N_KEYS.create_error,
    update_conf: BANK_PROFILE_I18N_KEYS.update_conf,
    update_error: BANK_PROFILE_I18N_KEYS.update_error,
    delete_conf: BANK_PROFILE_I18N_KEYS.delete_conf,
    delete_error: BANK_PROFILE_I18N_KEYS.delete_error,
  });

  public async create(profile: BankProfileModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<BankProfileModel>(BankProfileCollection, profile,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  public async update(profile: BankProfileModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BankProfileModel>(BankProfileCollection, profile, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  public async delete(profile: BankProfileModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<BankProfileModel>(BankProfileCollection, profile,
      this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  private query(accountingTenantId: string) {
    return [...getSystemQuery(this.tenantId), { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId }];
  }

  public list(accountingTenantId: string): Observable<BankProfileModel[]> {
    return this.firestoreService.searchData<BankProfileModel>(BankProfileCollection, this.query(accountingTenantId), 'bankName', 'asc');
  }

  public listOnce(accountingTenantId: string): Promise<BankProfileModel[]> {
    return this.firestoreService.getDataOnce<BankProfileModel>(BankProfileCollection, this.query(accountingTenantId), 'bankName', 'asc');
  }

  /** The tenant's only profile of a format, or undefined when there is none or more than one — for files without an IBAN. */
  public async findSingleByFormat(accountingTenantId: string, format: BankFormat): Promise<BankProfileModel | undefined> {
    const matches = (await this.listOnce(accountingTenantId)).filter(p => p.format === format);
    return matches.length === 1 ? matches[0] : undefined;
  }

  /** The profile for a normalized IBAN, or undefined — one-shot read, used by the import. */
  public async findByIban(accountingTenantId: string, iban: string): Promise<BankProfileModel | undefined> {
    const all = await this.listOnce(accountingTenantId);
    return all.find(p => p.iban === iban);
  }
}
