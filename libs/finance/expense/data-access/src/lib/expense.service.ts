import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ExpenseCollection, ExpenseModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  public async create(expense: ExpenseModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.createModel<ExpenseModel>(
      ExpenseCollection, expense, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async update(expense: ExpenseModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.updateModel<ExpenseModel>(
      ExpenseCollection, expense, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async delete(expense: ExpenseModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ExpenseModel>(
      ExpenseCollection, expense, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public read(key: string): Observable<ExpenseModel | undefined> {
    return this.firestoreService.readModel<ExpenseModel>(ExpenseCollection, key);
  }

  public listAll(orderBy = 'bkey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    return this.firestoreService.searchData<ExpenseModel>(
      ExpenseCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public listForUser(userId: string, orderBy = 'bkey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'userId', operator: '==', value: userId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }

  public listForTenant(accountingTenantId: string, orderBy = 'bkey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'accountingTenantId', operator: '==', value: accountingTenantId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }
}
