import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

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
    return await this.firestoreService.createModel<AccountModel>(AccountCollection, account, '@finance.account.operation.create', currentUser);
  }

  public read(key: string): Observable<AccountModel | undefined> {
    return findByKey<AccountModel>(this.list(), key);
  }

  public async update(account: AccountModel, currentUser?: UserModel, confirmMessage = '@finane.account.operation.update'): Promise<string | undefined> {
    account.index = getAccountIndex(account);
    return await this.firestoreService.updateModel<AccountModel>(AccountCollection, account, false, confirmMessage, currentUser);
  }

  public async delete(account: AccountModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AccountModel>(AccountCollection, account, '@finane.account.operation.delete', currentUser);
  }

  /**
   * Fetches all accounts, collects the full subtree via the recursive collectSubtree helper,
   * then soft-deletes each node in order (root first, then children depth-first)
   * @param rootKey 
   * @param currentUser 
   */
  public async deleteTree(rootKey: string, currentUser?: UserModel): Promise<void> {
    const all = await firstValueFrom(this.list());
    const subtree = this.collectSubtree(all, rootKey);
    for (const account of subtree) {
      await this.delete(account, currentUser);
    }
  }

  /**
   * Private recursive helper that finds the node by key, then walks all its descendants via
   * parentId matching.
   * @param accounts 
   * @param key 
   * @returns 
   */
  private collectSubtree(accounts: AccountModel[], key: string): AccountModel[] {
    const node = accounts.find(a => a.bkey === key);
    if (!node) return [];
    const children = accounts.filter(a => a.parentId === key);
    return [node, ...children.flatMap(c => this.collectSubtree(accounts, c.bkey))];
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  public list(orderBy = 'id', sortOrder = 'asc'): Observable<AccountModel[]> {
    return this.firestoreService.searchData<AccountModel>(AccountCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
}
