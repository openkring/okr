import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AccountCollection, AccountModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getAccountIndex } from '@bk2/finance-account-util';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(account: AccountModel, currentUser?: UserModel): Promise<string | undefined> {
    account.index = getAccountIndex(account);
    return await this.firestoreService.createModel<AccountModel>(AccountCollection, account, '@account.operation.create', currentUser);
  }

  public read(key: string): Observable<AccountModel | undefined> {
    return findByKey<AccountModel>(this.list(), key);
  }

  public async update(account: AccountModel, currentUser?: UserModel, confirmMessage = '@account.operation.update'): Promise<string | undefined> {
    account.index = getAccountIndex(account);
    return await this.firestoreService.updateModel<AccountModel>(AccountCollection, account, false, confirmMessage, currentUser);
  }

  public async delete(account: AccountModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AccountModel>(AccountCollection, account, '@account.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<AccountModel[]> {
    return this.firestoreService.searchData<AccountModel>(AccountCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
}
