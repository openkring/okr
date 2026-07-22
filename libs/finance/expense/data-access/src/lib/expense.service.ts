import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { ExpenseCollection, ExpenseModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { PFX } from './scope';

export interface CreateExpensePayload {
  tenantId: string;
  abstract: string;
  amountTotal: number;
  currency: string;
  transferTo: 'me' | 'issuer';
  iban: string;
  category: string;
  costCenterId: string;
  note: string;
  receiptCount: number;
}

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

  // The 'expenses' collection is CF-write-only: creation goes through the 'createExpense'
  // callable, which derives accountingTenantId server-side (= tenantId) and owns the initial
  // 'processing' status. Do NOT write 'expenses' from the client SDK.
  public async createViaFunction(payload: CreateExpensePayload): Promise<string> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'createExpense');
    const result = await fn(payload);
    return (result.data as { expenseKey: string }).expenseKey;
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

  public listAll(orderBy = 'okey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    return this.firestoreService.searchData<ExpenseModel>(
      ExpenseCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public listForUser(userId: string, orderBy = 'okey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'userId', operator: '==', value: userId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }

  public listForTenant(accountingTenantId: string, orderBy = 'okey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'accountingTenantId', operator: '==', value: accountingTenantId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }
}
