import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BankProfileCollection, BankProfileModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { BANK_PROFILE_I18N_KEYS } from '@okr/finance-bank-profile-util';

@Injectable({ providedIn: 'root' })
export class BankProfileService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(profile: BankProfileModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<BankProfileModel>(BankProfileCollection, profile,
      BANK_PROFILE_I18N_KEYS.create_conf, BANK_PROFILE_I18N_KEYS.create_error, currentUser);
  }

  public async update(profile: BankProfileModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BankProfileModel>(BankProfileCollection, profile, false,
      BANK_PROFILE_I18N_KEYS.update_conf, BANK_PROFILE_I18N_KEYS.update_error, currentUser);
  }

  public async delete(profile: BankProfileModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<BankProfileModel>(BankProfileCollection, profile,
      BANK_PROFILE_I18N_KEYS.delete_conf, BANK_PROFILE_I18N_KEYS.delete_error, currentUser);
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

  /** The profile for a normalized IBAN, or undefined — one-shot read, used by the import. */
  public async findByIban(accountingTenantId: string, iban: string): Promise<BankProfileModel | undefined> {
    const all = await this.listOnce(accountingTenantId);
    return all.find(p => p.iban === iban);
  }
}
