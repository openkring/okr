import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { AccountCollection, AccountModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getAccountIndex } from '@bk2/finance-account-util';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'operation.create.conf',
    create_error: PFX + 'operation.create.error',
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
    delete_conf:  PFX + 'operation.delete.conf',
    delete_error: PFX + 'operation.delete.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(account: AccountModel, currentUser?: UserModel): Promise<string | undefined> {
    account.index = getAccountIndex(account);
    return await this.firestoreService.createModel<AccountModel>(AccountCollection, account, PFX + 'operation.create.conf', PFX + 'operation.create.error', currentUser);
  }

  public read(key: string): Observable<AccountModel | undefined> {
    return findByKey<AccountModel>(this.list(), key);
  }

  public async update(account: AccountModel, currentUser?: UserModel): Promise<string | undefined> {
    account.index = getAccountIndex(account);
    return await this.firestoreService.updateModel<AccountModel>(AccountCollection, account, false, PFX + 'operation.update.conf', PFX + 'operation.update.error', currentUser);
  }

  public async delete(account: AccountModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AccountModel>(AccountCollection, account, PFX + 'operation.delete.conf', PFX + 'operation.delete.error', currentUser);
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
